import { BaseWorker, Logger, MasterOptions } from '@master/core';
import { Master } from './Master';

export class MasterWorker extends BaseWorker {
    public readonly master: Master;

    public constructor(
        logger: Logger,
        config: Configuration,
        options: Omit<MasterOptions, 'worker'>
    ) {
        super(logger);

        logger.info(`
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

MAIN PROCESS INITIALIZED

@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@`);

        this.master = new Master(logger, config, { ...options, worker: this });
    }

    public async start(): Promise<void> {
        await this.master.start();
        super.start();
    }
}
