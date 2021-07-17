import { BaseSubtag, BBTagContext, guard, SubtagType } from '@cluster/core';

export class FlagSetSubtag extends BaseSubtag {
    public constructor() {
        super({
            name: 'flagset',
            category: SubtagType.BOT,
            definition: [
                {
                    parameters: ['flagName'],
                    description: 'Returns `true` or `false`, depending on whether the specified case-sensitive flag code has been set or not.',
                    exampleCode: '{flagset;a} {flagset;_}',
                    exampleIn: 'Hello, -a world!',
                    exampleOut: 'true false',
                    execute: (ctx, [{ value: flagName }]) => this.isFlagSet(ctx, flagName)
                }
            ]
        });
    }

    public isFlagSet(context: BBTagContext, flagName: string): 'true' | 'false' {
        if (guard.isLetter(flagName) || flagName === '_')
            return (context.flaggedInput[flagName] !== undefined).toString();
        return 'false';
    }
}
