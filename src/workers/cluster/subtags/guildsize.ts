import { BaseSubtag } from '@cluster/bbtag';
import { SubtagType } from '@cluster/utils';

export class GuildSizeSubtag extends BaseSubtag {
    public constructor() {
        super({
            name: 'guildsize',
            aliases: ['inguild'],
            category: SubtagType.API,
            desc: 'Returns the number of members on the current guild.',
            definition: [
                {
                    parameters: [],
                    exampleCode: 'This guild has {guildsize} members.',
                    exampleOut: 'This guild has 123 members.',
                    execute: (ctx) => ctx.guild.memberCount.toString()
                }
            ]
        });
    }
}