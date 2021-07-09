import { BaseGuildCommand, commandTypes, FlagResult, guard, GuildCommandContext, humanize, parse } from '../core';

export class MassBanCommand extends BaseGuildCommand {
    public constructor() {
        super({
            name: 'massban',
            aliases: ['hackban'],
            category: commandTypes.ADMIN,
            flags: [
                { flag: 'r', word: 'reason', desc: 'The reason for the ban.' }
            ],
            definition: {
                parameters: '{userIds+} [deleteDays:number]',
                description: 'Bans a user who isn\'t currently on your guild, where `<userIds...>` is a list of user IDs ' +
                    'or mentions (separated by spaces) and `days` is the number of days to delete messages for (defaults to 0).\n' +
                    'If mod-logging is enabled, the ban will be logged.',
                execute: (ctx, [users, deleteDays = 1], flags) => this.massBan(ctx, users, deleteDays, flags)
            }
        });
    }

    public async massBan(context: GuildCommandContext, userIds: string[], deleteDays: number, flags: FlagResult): Promise<string> {
        userIds = userIds.flatMap(u => parse.entityId(u)).filter(guard.hasValue);

        const reason = flags.r?.join(' ');

        const result = await context.cluster.moderation.bans.massBan(context.channel.guild, userIds, context.author, true, deleteDays, reason);
        if (Array.isArray(result))
            return `✅ The following user(s) have been banned:${result.map(humanize.fullName).map(u => `\n**${u}**`).join('')}`;

        switch (result) {
            case 'alreadyBanned': return '❌ All those users are already banned!';
            case 'memberTooHigh': return '❌ I don\'t have permission to ban any of those users! Their highest roles are above my highest role.';
            case 'moderatorTooLow': return '❌ You don\'t have permission to ban any of those users! Their highest roles are above your highest role.';
            case 'noPerms': return '❌ I don\'t have permission to ban anyone! Make sure I have the `ban members` permission and try again.';
            case 'moderatorNoPerms': return '❌ You don\'t have permission to ban anyone! Make sure you have the `ban members` permission or one of the permissions specified in the `ban override` setting and try again.';
            case 'noUsers': return '❌ None of the user ids you gave were valid users!';
        }
    }
}