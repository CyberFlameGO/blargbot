import { Cluster } from '../cluster';
import { BaseSubtag } from '../core/bbtag';
import { SubtagType } from '../utils';

export class VoidSubtag extends BaseSubtag {
    public constructor(
        cluster: Cluster
    ) {
        super(cluster, {
            name: 'void',
            category: SubtagType.COMPLEX,
            definition: [
                {
                    parameters: ['code?'],
                    description: 'Executes `code` but does not return the output from it. Useful for silent functionality',
                    exampleCode: '{void;This won\'t be output!}',
                    exampleOut: '',
                    execute: () => ''
                }
            ]
        });
    }
}