import { BaseSubtag } from '@cluster/bbtag';
import { SubtagType } from '@cluster/utils';

export class UriDecodeSubtag extends BaseSubtag {
    public constructor() {
        super({
            name: 'uridecode',
            category: SubtagType.COMPLEX,
            definition: [
                {
                    parameters: ['text'],
                    description: 'Decodes `text` from URI format.',
                    exampleCode: '{uridecode;Hello%20world}',
                    exampleOut: 'Hello world!',
                    execute: (_, [{ value: text }]) => decodeURIComponent(text)
                }
            ]
        });
    }
}