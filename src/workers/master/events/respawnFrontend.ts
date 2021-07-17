import { ClusterConnection } from '../../cluster';
import { WorkerPoolEventService } from '@master/core';
import { Master } from '../Master';

export class RespawnFrontendHandler extends WorkerPoolEventService<ClusterConnection> {
    public constructor(private readonly master: Master) {
        super(master.clusters, 'respawnFrontend');
    }

    protected execute(): void {
        // TODO once the frontend is added back
        this.master.logger.fatal('Frontend isnt supported yet ya dummy!');
    }
}
