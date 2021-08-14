import { BaseSubtag, BBTagContext } from '@cluster/bbtag';
import { SubtagCall } from '@cluster/types';
import { SubtagType } from '@cluster/utils';
import { Channel } from 'discord.js';

export class ChannelTypeSubtag extends BaseSubtag {
    public constructor() {
        super({
            name: 'channeltype',
            category: SubtagType.API,
            desc: 'Possible results: ' + Object.values(channelTypes).map(t => '`' + t + '`').join(', '),
            definition: [
                {
                    parameters: [],
                    description: 'Returns the type the current channel.',
                    exampleCode: '{channeltype}',
                    exampleOut: 'text',
                    execute: (ctx) => channelTypes[ctx.channel.type]
                },
                {
                    parameters: ['channel', 'quiet?'],
                    description: 'Returns the type the given `channel`. If it cannot be found returns `No channel found`, or nothing if `quiet` is `true`.',
                    exampleCode: '{channeltype;cool channel}\n{channeltype;some channel that doesn\'t exist;true}',
                    exampleOut: 'voice\n(nothing is returned here)',
                    execute: (ctx, [channel, quiet], subtag) => this.getChannelId(ctx, channel.value, quiet.value, subtag)

                }
            ]
        });
    }

    public async getChannelId(
        context: BBTagContext,
        channelStr: string,
        quietStr: string,
        subtag: SubtagCall
    ): Promise<string> {
        const quiet = typeof context.scope.quiet === 'boolean' ? context.scope.quiet : quietStr.length > 0;
        const channel = await context.getChannel(channelStr, { quiet, suppress: context.scope.suppressLookup });
        if (channel === undefined)
            return quiet ? '' : this.channelNotFound(context, subtag, `${channelStr} could not be found`);
        return channelTypes[channel.type];
    }
}

/* eslint-disable @typescript-eslint/naming-convention */
const channelTypes: { [key in Channel['type']]: string } = {
    GUILD_TEXT: 'text',
    DM: 'dm',
    GUILD_VOICE: 'voice',
    GROUP_DM: 'group-dm',
    GUILD_CATEGORY: 'category',
    GUILD_NEWS: 'news',
    GUILD_STORE: 'store',
    GUILD_NEWS_THREAD: 'news-thread',
    GUILD_PRIVATE_THREAD: 'private-thread',
    GUILD_PUBLIC_THREAD: 'public-thread',
    GUILD_STAGE_VOICE: 'stage-voice',
    UNKNOWN: 'unknown'
};
/* eslint-enable @typescript-eslint/naming-convention */