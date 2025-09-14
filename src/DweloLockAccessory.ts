import {
  AccessoryPlugin,
  API,
  CharacteristicValue,
  Logging,
  Service,
} from 'homebridge';

import { DweloAPI, Sensor } from './DweloAPI';

export class DweloLockAccessory implements AccessoryPlugin {
  private readonly lockService: Service;
  private readonly batteryService: Service;

  private inFlight = false;
  private desiredTarget: number | null = null;
  private pollTimer?: NodeJS.Timeout;
  private watchdog?: NodeJS.Timeout;

  constructor(
    private readonly log: Logging,
    private readonly api: API,
    private readonly lockPollMs: number,
    private readonly dweloAPI: DweloAPI,
    public readonly name: string,
    private readonly lockID: number) {
    this.lockService = new api.hap.Service.LockMechanism(name);

    this.lockService.getCharacteristic(api.hap.Characteristic.LockCurrentState)
      .onGet(this.getLockState.bind(this));

    this.lockService.getCharacteristic(api.hap.Characteristic.LockTargetState)
      .onGet(this.getTargetLockState.bind(this))
      .onSet(this.setTargetLockState.bind(this));

    this.batteryService = new api.hap.Service.Battery(name);

    this.pollTimer = setInterval(() => this.poll(), this.lockPollMs);

    log.info(`Dwelo Lock '${name}' created!`);
  }

  identify(): void {
    this.log('Identify!');
  }

  getServices(): Service[] {
    return [this.lockService, this.batteryService];
  }

  private async getLockState() {
    const sensors = await this.dweloAPI.sensors(this.lockID);
    const state = this.toLockState(sensors);
    this.setBatteryLevel(sensors);
    this.log.info(`Current state of the lock was returned: ${state}`);
    return state;
  }

  private async getTargetLockState() {
    if (this.desiredTarget !== null) {
      return this.desiredTarget;
    }
    // fall back to mapping current -> target
    const cur = await this.getLockState();
    return (cur === this.api.hap.Characteristic.LockCurrentState.SECURED)
      ? this.api.hap.Characteristic.LockTargetState.SECURED
      : this.api.hap.Characteristic.LockTargetState.UNSECURED;
  }

  private async setTargetLockState(value: CharacteristicValue) {
    const T = this.api.hap.Characteristic.LockTargetState;
    const target = (value === T.SECURED) ? T.SECURED : T.UNSECURED;

    // coalesce duplicate commands while one is in flight
    if (this.inFlight && this.desiredTarget === target) {
      this.log.debug('Coalescing duplicate lock request:', target);
      return; // ACK immediately
    }

    this.desiredTarget = target;
    this.lockService.getCharacteristic(T).updateValue(target);
    this.log.info(`Setting lock to: ${target}`);

    if (!this.inFlight) {
      this.inFlight = true;
      this.sendLockCommand(target);
      this.startWatchdog();
    }
  }

  private toLockState(sensors: Sensor[]) {
    const lockSensor = sensors.find(s => s.sensorType === 'lock');
    if (!lockSensor) {
      return this.api.hap.Characteristic.LockCurrentState.UNKNOWN;
    }
    return lockSensor.value === 'locked'
      ? this.api.hap.Characteristic.LockCurrentState.SECURED
      : this.api.hap.Characteristic.LockCurrentState.UNSECURED;
  }

  private setBatteryLevel(sensors: Sensor[]) {
    const batterySensor = sensors.find(s => s.sensorType === 'battery');
    if (!batterySensor) {
      return;
    }

    const batteryLevel = parseInt(batterySensor.value, 10);
    const batteryStatus = batteryLevel > 20
      ? this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL
      : this.api.hap.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;

    this.batteryService.getCharacteristic(this.api.hap.Characteristic.BatteryLevel).updateValue(batteryLevel);
    this.batteryService.getCharacteristic(this.api.hap.Characteristic.StatusLowBattery).updateValue(batteryStatus);

    this.log.info('Lock battery: ', batteryLevel);
  }

  private async sendLockCommand(target: number) {
    try {
      const desired = target === this.api.hap.Characteristic.LockTargetState.SECURED;
      await this.dweloAPI.toggleLock(desired, this.lockID);
    } catch (err) {
      this.log.warn('Lock command failed:', err);
      this.inFlight = false;
      await this.reconcileTargetWithCurrent();
    }
  }

  private async poll() {
    try {
      const sensors = await this.dweloAPI.sensors(this.lockID);
      const currentState = this.toLockState(sensors);

      this.setBatteryLevel(sensors);
      this.lockService.getCharacteristic(this.api.hap.Characteristic.LockCurrentState).updateValue(currentState);

      if (this.inFlight && this.desiredTarget !== null) {
        const desiredState =
          this.desiredTarget === this.api.hap.Characteristic.LockTargetState.SECURED
            ? this.api.hap.Characteristic.LockCurrentState.SECURED
            : this.api.hap.Characteristic.LockCurrentState.UNSECURED;

        if (currentState === desiredState) {
          this.inFlight = false;
          if (this.watchdog) {
            clearTimeout(this.watchdog);
          }
          this.log.info('Lock toggle completed');
        }
      }
    } catch (e) {
      this.log.warn(`Failed to fetch status of lock ${this.name}`);
    }
  }

  private startWatchdog() {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
    }
    this.watchdog = setTimeout(async () => {
      this.log.warn('Lock operation watchdog expired; reconciling.');
      this.inFlight = false;
      await this.reconcileTargetWithCurrent();
    }, 2 * this.lockPollMs);
  }

  private async reconcileTargetWithCurrent() {
    const currentState = await this.getLockState();
    const T = this.api.hap.Characteristic.LockTargetState;
    this.desiredTarget =
      currentState === this.api.hap.Characteristic.LockCurrentState.SECURED ? T.SECURED : T.UNSECURED;
    this.lockService.getCharacteristic(T).updateValue(this.desiredTarget);
  }
}
