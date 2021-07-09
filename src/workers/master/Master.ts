import moment from 'moment';
import { BaseClient, ModuleLoader, BaseService, EvalResult, Logger, MasterOptions } from './core';
import { MasterWorker } from './MasterWorker';
import fetch from 'node-fetch';
import { ClusterPool } from '../cluster';

export class Master extends BaseClient {
    public readonly clusters: ClusterPool;
    public readonly eventHandlers: ModuleLoader<BaseService>;
    public readonly services: ModuleLoader<BaseService>;
    public readonly worker: MasterWorker;

    public constructor(
        logger: Logger,
        config: Configuration,
        options: MasterOptions
    ) {
        super(logger, config, {});
        this.worker = options.worker;
        this.clusters = new ClusterPool(this.config.discord.shards, this.logger);
        this.eventHandlers = new ModuleLoader(`${__dirname}/events`, BaseService, [this, options], this.logger, e => e.name);
        this.services = new ModuleLoader(`${__dirname}/services`, BaseService, [this, options], this.logger, e => e.name);
        // TODO Add websites

        this.services.on('add', (module: BaseService) => void module.start());
        this.services.on('remove', (module: BaseService) => void module.stop());
        this.eventHandlers.on('add', (module: BaseService) => void module.start());
        this.eventHandlers.on('remove', (module: BaseService) => void module.stop());
    }

    public async start(): Promise<void> {
        await this.eventHandlers.init();
        this.logger.init(this.moduleStats(this.eventHandlers, 'Events', ev => ev.type));

        await Promise.all([
            super.start(),
            this.hello()
        ]);

        await this.services.init();
        this.logger.init(this.moduleStats(this.services, 'Services', ev => ev.type));
    }

    private async hello(): Promise<void> {
        try {
            await fetch(`https://discordapp.com/api/channels/${this.config.discord.channels.botlog}/messages`, {
                method: 'POST',
                headers: {
                    /* eslint-disable @typescript-eslint/naming-convention */
                    'Authorization': this.config.discord.token,
                    'Content-Type': 'application/json'
                    /* eslint-enable @typescript-eslint/naming-convention */
                },
                body: JSON.stringify({ content: `My master process just initialized on \`${moment().format('MMMM Do, YYYY[` at `]hh:mm:ss.SS')}\`.` })
            });
        } catch (err: unknown) {
            this.logger.error('Could not post startup message', err);
        }
    }
    public async eval(author: string, text: string): Promise<EvalResult> {
        if (author !== this.config.discord.users.owner)
            throw new Error(`User ${author} does not have permission to run eval`);

        try {
            const code = text.includes('\n')
                ? `async () => ${text}`
                : `async () => { ${text} }`;
            const func = eval(code) as () => Promise<unknown>;
            return { success: true, result: await func.call(this) };
        } catch (err: unknown) {
            return { success: false, error: err };
        }
    }
}