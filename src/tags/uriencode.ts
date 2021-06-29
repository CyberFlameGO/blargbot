import { Cluster } from '../cluster';
import { BaseSubtag } from '../core/bbtag';
import { SubtagType } from '../utils';

export class UriEncodeSubtag extends BaseSubtag {
    public constructor(
        cluster: Cluster
    ) {
        super(cluster, {
            name: 'uriencode',
            category: SubtagType.COMPLEX,
            definition: [
                {
                    parameters: ['text'],
                    description: 'Encodes `text` in URI format. Useful for constructing links.',
                    exampleCode: '{uriencode;Hello world!}',
                    exampleOut: 'Hello%20world!',
                    execute: (_, [{value: text}]) => encodeURIComponent(text)
                }
            ]
        });
    }
}