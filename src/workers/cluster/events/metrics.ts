import { ClusterEventService, ProcessMessageHandler, metrics } from '../core';
import { Cluster } from '../Cluster';

export class MetricsHandler extends ClusterEventService {
    public constructor(cluster: Cluster) {
        super(cluster, 'metrics');
    }

    protected execute([, , reply]: Parameters<ProcessMessageHandler>): void {
        metrics.userGauge.set(this.cluster.discord.users.size);
        reply(metrics.aggregated.getMetricsAsJSON());
    }
}