import { ClusterEventService, ProcessMessageHandler, SubtagListResult } from '@cluster/core';
import { Cluster } from '../Cluster';

export class ClusterTagListHandler extends ClusterEventService {
    public constructor(
        cluster: Cluster
    ) {
        super(cluster, 'tagList');
    }

    protected execute([, , reply]: Parameters<ProcessMessageHandler>): void {
        const tags: SubtagListResult = {};
        for (const t of this.cluster.subtags.list()) {
            tags[t.name] = {
                category: t.category,
                name: t.name,
                signatures: t.signatures,
                deprecated: t.deprecated,
                staff: t.staff,
                aliases: t.aliases
            };
        }
        reply(tags);
    }
}
