import { BaseSubtag, SubtagType } from '@cluster/core';

export class LowerSubtag extends BaseSubtag {
    public constructor() {
        super({
            name: 'lower',
            category: SubtagType.COMPLEX,
            definition: [
                {
                    parameters: ['text'],
                    description: 'Returns `text` as lowercase.',
                    exampleCode: '{lower;THIS WILL BECOME LOWERCASE}',
                    exampleOut: 'this will become lowercase',
                    execute: (_, [{ value: text }]) => text.toLowerCase()
                }
            ]
        });
    }
}
