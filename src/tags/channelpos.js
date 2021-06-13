/*
 * @Author: stupid cat
 * @Date: 2017-05-07 18:30:28
 * @Last Modified by: RagingLink
 * @Last Modified time: 2021-06-13 15:01:19
 *
 * This project uses the AGPLv3 license. Please read the license file before using/adapting any of the code.
 */

const Builder = require('../structures/TagBuilder');

module.exports =
    Builder.APITag('channelpos')
        .withAlias('categorypos')
        .withArgs(a => [a.optional('channelid'), a.optional('quiet')])
        .withDesc('Returns the position of the current channel. If no channelid is given, the current channels position will be returned.\n'
            + 'The position is the index per channel type (text, voice or category) in the channel list.')
        .withExample(
            'This channel is in position {channelpos}',
            'This channel is in position 1'
        )
        .whenArgs(0, async (_, context) => context.channel.position)
        .whenArgs('1-2', async (subtag, context, args) => {
            let quiet = bu.isBoolean(context.scope.quiet) ? context.scope.quiet : !!args[1];
            let channel = await Builder.util.parseChannel(context, args[0], { quiet });
            if (!channel)
                return quiet ? '' : Builder.errors.noChannelFound(subtag, context);

            return channel.position;
        })
        .whenDefault(Builder.errors.tooManyArguments)
        .build();
