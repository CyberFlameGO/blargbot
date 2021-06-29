import { Cluster } from '../cluster';
import { BaseSubtag } from '../core/bbtag';
import { SubtagType } from '../utils';

export class UriDecodeSubtag extends BaseSubtag {
    public constructor(
        cluster: Cluster
    ) {
        super(cluster, {
            name: 'uridecode',
            category: SubtagType.COMPLEX,
            definition: [
                {
                    parameters: ['text'],
                    description: 'Decodes `text` from URI format.',
                    exampleCode: '{uridecode;Hello%20world}',
                    exampleOut: 'Hello world!',
                    execute: (_, [{value: text}]) => decodeURIComponent(text)
                }
            ]
        });
    }
}