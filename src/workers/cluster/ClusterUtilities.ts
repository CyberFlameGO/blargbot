import { FindEntityOptions, LookupMatch, MessagePrompt } from '@cluster/types';
import { codeBlock, defaultStaff, guard, humanize, parse, snowflake } from '@cluster/utils';
import { BaseUtilities } from '@core/BaseUtilities';
import { SendPayload, SendPayloadContent } from '@core/types';
import { AllChannels, EmojiIdentifierResolvable, GuildMember, GuildTextBasedChannels, Message, MessageActionRowOptions, MessageComponentInteraction, MessageSelectOptionData, Permissions, PermissionString, Role, TextBasedChannels, User, UserChannelInteraction } from 'discord.js';
import moment from 'moment';
import fetch from 'node-fetch';

import { Cluster } from './Cluster';

export class ClusterUtilities extends BaseUtilities {
    public constructor(
        public readonly cluster: Cluster
    ) {
        super(cluster);
    }

    public async lookup<T>(
        channel: TextBasedChannels,
        user: User,
        choices: Array<{ label: string; value: T; description?: string; emoji?: EmojiIdentifierResolvable; }>,
        payload: string | Omit<SendPayloadContent, 'components'>,
        timeout = 300000
    ): Promise<T | undefined> {
        if (choices.length === 0)
            return undefined;

        if (typeof payload === 'string')
            payload = { content: payload };

        const prevId = snowflake.create().toString();
        const nextId = snowflake.create().toString();
        const selectId = snowflake.create().toString();

        const valueMap: Record<string, T | undefined> = {};
        const options: MessageSelectOptionData[] = [];
        let page = 0;
        const lastPage = Math.floor(choices.length / 24);

        for (const option of choices) {
            const id = snowflake.create().toString();
            valueMap[id] = option.value;
            options.push({ ...option, value: id });
        }

        const validIds = new Set([nextId, prevId, selectId]);
        const collector = channel.createMessageComponentCollector({
            time: timeout,
            filter: async (interaction) => {
                if (!validIds.has(interaction.customId))
                    return false;

                if (interaction.user.id !== user.id) {
                    await interaction.reply({ content: '❌ You cant use this lookup!', ephemeral: true });
                    return false;
                }

                return true;
            }
        });

        try {
            collector.on('collect', async interaction => {
                let pageShift = -1;
                switch (interaction.customId) {
                    case nextId:
                        pageShift = 1;
                    //fallthrough
                    case prevId: {
                        page += pageShift;
                        const promises: Array<Promise<unknown>> = [interaction.deferUpdate({})];
                        if (prompt?.editable === true)
                            promises.push(prompt.edit({ components: createComponents() }));
                        await Promise.all(promises);
                        break;
                    }
                    case selectId:
                        collector.stop();
                        break;
                }
            });

            const createComponents = (): MessageActionRowOptions[] => {
                const result: MessageActionRowOptions[] = [
                    {
                        type: 'ACTION_ROW',
                        components: [
                            {
                                type: 'SELECT_MENU',
                                customId: selectId,
                                options: [
                                    ...options.slice(page * 24, (page + 1) * 24),
                                    { label: 'Cancel', value: snowflake.create().toString(), emoji: '❌' }
                                ]
                            }
                        ]
                    }
                ];
                if (lastPage === 0)
                    return result;

                result.push({
                    type: 'ACTION_ROW',
                    components: [
                        {
                            type: 'BUTTON',
                            customId: prevId,
                            label: page === 0
                                ? 'Previous page'
                                : `Previous page (${page}/${lastPage + 1})`,
                            emoji: '◀️',
                            style: 'SECONDARY',
                            disabled: page === 0
                        },
                        {

                            type: 'BUTTON',
                            customId: nextId,
                            label: page === lastPage
                                ? 'Next page'
                                : `Next page (${page + 2}/${lastPage + 1})`,
                            emoji: '▶️',
                            style: 'SECONDARY',
                            disabled: page === lastPage
                        }
                    ]
                });

                return result;
            };

            const prompt = await this.send(channel, {
                ...payload,
                components: createComponents()
            });

            if (prompt === undefined)
                return undefined;

            try {
                const interaction = await new Promise<MessageComponentInteraction | undefined>(resolve => collector.on('end', c => resolve(c.last())));
                if (interaction === undefined || !interaction.isSelectMenu())
                    return undefined;
                return valueMap[interaction.values[0]];
            } finally {
                await prompt.delete();
            }
        } catch (err: unknown) {
            return undefined;
        } finally {
            collector.stop();
        }
    }

    public async getMember(msg: UserChannelInteraction<GuildTextBasedChannels>, name: string, args?: FindEntityOptions): Promise<GuildMember | undefined> {
        const user = await this.getUser(msg, name, args);
        if (user === undefined)
            return undefined;

        return await this.getMemberById(msg.channel.guild, user.id);
    }

    public async getUser(msg: UserChannelInteraction, name: string, args: FindEntityOptions = {}): Promise<User | undefined> {
        if (name.length === 0)
            return undefined;

        const normName = name.toLowerCase();
        const matchScore = (user: { name: string; nick: string; normName: string; normNick: string; }): number => {
            let score = 0;
            if (user.name.startsWith(name)) score += 100;
            if (user.nick.startsWith(name)) score += 100;
            if (user.normName.startsWith(normName)) score += 10;
            if (user.normNick.startsWith(normName)) score += 10;
            if (user.normName.includes(normName)) score += 1;
            if (user.normNick.includes(normName)) score += 1;
            return score;
        };

        const user = await this.getUserById(name);
        if (user !== undefined)
            return user;

        if (!guard.isGuildRelated(msg)) {
            return matchScore({
                name: msg.author.username,
                nick: msg.author.username,
                normName: msg.author.username.toLowerCase(),
                normNick: msg.author.username.toLowerCase()
            }) > 0 ? msg.author : undefined;
        }

        let discrim: string | undefined;
        const nameMatch = /^(.*)#(\d{4})$/.exec(name);
        if (nameMatch !== null) {
            [, name, discrim] = nameMatch;
        }

        const userList = msg.channel.guild.members.cache
            .map(m => ({
                member: m,
                match: matchScore({
                    name: m.user.username,
                    nick: m.nickname ?? m.user.username,
                    normNick: m.nickname?.toLowerCase() ?? m.user.username.toLowerCase(),
                    normName: m.user.username.toLowerCase()
                })
            }))
            .filter(m => m.match > 0 && (discrim === undefined || discrim === m.member.user.discriminator))
            .sort((a, b) => b.match - a.match)
            .map(m => m.member.user);

        switch (userList.length) {
            case 1: return userList[0];
            case 0:
                if (args.quiet === true || args.suppress === true)
                    return undefined;
                if (args.onSendCallback !== undefined)
                    args.onSendCallback();
                await this.send(msg, `No users found${args.label !== undefined ? ' in ' + args.label : ''}.`);
                return undefined;
            default: {
                if (args.quiet === true || args.suppress === true)
                    return undefined;
                const matches = userList.map(m => ({ content: `${m.username}#${m.discriminator} - ${m.id}`, value: m }));
                const lookupResponse = await this.createLookup(msg, 'user', matches, args);
                return lookupResponse;
            }
        }
    }

    public async getRole(msg: UserChannelInteraction<GuildTextBasedChannels>, name: string, args: boolean | FindEntityOptions = {}): Promise<Role | undefined> {
        if (name.length === 0)
            return undefined;

        const normName = name.toLowerCase();
        const matchScore = (role: { name: string; normName: string; }): number => {
            let score = 0;
            if (role.name.startsWith(name)) score += 100;
            if (role.normName.startsWith(normName)) score += 10;
            if (role.normName.includes(normName)) score += 1;
            return score;
        };

        if (typeof args !== 'object')
            args = { quiet: args };

        const role = await this.getRoleById(msg.channel.guild, name);
        if (role !== undefined)
            return role;

        const roleList = msg.channel.guild.roles.cache
            .map(r => ({
                role: r,
                match: matchScore({
                    name: r.name,
                    normName: r.name.toLowerCase()
                })
            }))
            .filter(r => r.match > 0)
            .sort((a, b) => b.match - a.match)
            .map(r => r.role);

        switch (roleList.length) {
            case 1: return roleList[0];
            case 0:
                if (args.quiet === true || args.suppress === true)
                    return undefined;
                if (args.onSendCallback !== undefined)
                    args.onSendCallback();
                await this.send(msg, `No roles found${args.label !== undefined ? ' in ' + args.label : ''}.`);
                return undefined;
            default: {
                if (args.quiet === true || args.suppress === true)
                    return undefined;
                const matches = roleList.map(r => ({ content: `${r.name} - ${r.color.toString(16)} (${r.id})`, value: r }));
                const lookupResponse = await this.createLookup(msg, 'role', matches, args);
                return lookupResponse;
            }
        }
    }

    public async getChannel(msg: UserChannelInteraction, name: string, args: boolean | FindEntityOptions = {}): Promise<AllChannels | undefined> {
        if (name.length === 0)
            return undefined;

        const normName = name.toLowerCase();
        const matchScore = (role: { name: string; normName: string; }): number => {
            let score = 0;
            if (role.name.startsWith(name)) score += 100;
            if (role.normName.startsWith(normName)) score += 10;
            if (role.normName.includes(normName)) score += 1;
            return score;
        };

        if (typeof args !== 'object')
            args = { quiet: args };

        const channel = await this.getChannelById(name);
        if (guard.isGuildChannel(msg.channel)) {
            if (channel !== undefined)
                return channel;
        } else {
            return channel?.id === msg.channel.id ? channel : undefined;
        }

        const channelList = msg.channel.guild.channels.cache
            .map(c => ({
                channel: c,
                match: matchScore({
                    name: c.name,
                    normName: c.name.toLowerCase()
                })
            }))
            .filter(c => c.match > 0)
            .sort((a, b) => b.match - a.match)
            .map(c => c.channel);

        switch (channelList.length) {
            case 1: return channelList[0];
            case 0:
                if (args.quiet === true || args.suppress === true)
                    return undefined;
                if (args.onSendCallback !== undefined)
                    args.onSendCallback();
                await this.send(msg, `No channel found${args.label !== undefined ? ' in ' + args.label : ''}.`);
                return undefined;
            default: {
                if (args.quiet === true || args.suppress === true)
                    return undefined;
                const matches = channelList.map(c => ({ content: `${c.name} (${c.id})`, value: c }));
                const lookupResponse = await this.createLookup(msg, 'channel', matches, args);
                return lookupResponse;
            }
        }
    }

    public async displayPaged(
        channel: TextBasedChannels,
        user: User,
        filterText: string,
        getItems: (skip: number, take: number) => Promise<readonly string[]>,
        itemCount: () => Promise<number>,
        pageSize = 20,
        separator = '\n'
    ): Promise<boolean | undefined> {
        let page = 0;
        while (!isNaN(page)) {
            const items = await getItems(page * pageSize, pageSize);
            if (items.length === 0)
                return false;
            const total = await itemCount();
            const pageCount = Math.ceil(total / pageSize);
            const query = await this.createQuery(channel, user,
                `Found ${items.length}/${total}${filterText}.\n` +
                `Page **#${page + 1}/${pageCount}**\n` +
                `${codeBlock(items.join(separator), 'fix')}\n` +
                `Type a number between **1 and ${pageCount}** to view that page, or type \`c\` to cancel.`,
                reply => {
                    page = parse.int(reply.content) - 1;
                    return page >= 0 && page < pageCount
                        || reply.content.toLowerCase() === 'c';
                });

            const response = await query.response;
            try {
                await query.prompt?.delete();
            } catch (err: unknown) {
                this.logger.error(`Failed to delete paging prompt (channel: ${query.prompt?.channel.id ?? 'UNKNOWN'} message: ${query.prompt?.id ?? 'UNKNOWN'}):`, err);
            }
            if (response === undefined)
                return undefined;
        }
        return true;
    }

    public async createLookup<T>(msg: UserChannelInteraction, type: string, matches: Array<LookupMatch<T>>, args: FindEntityOptions = {}): Promise<T | undefined> {
        const lookupList = matches.slice(0, 20);
        let outputString = '';
        for (let i = 0; i < lookupList.length; i++) {
            outputString += `${i + 1 < 10 ? ` ${i + 1}` : i + 1}. ${lookupList[i].content}\n`;
        }
        const moreLookup = lookupList.length < matches.length ? `...and ${matches.length - lookupList.length}more.\n` : '';
        try {
            if (args.onSendCallback !== undefined)
                args.onSendCallback();

            const query = await this.createQuery(msg.channel, msg.author,
                `Multiple ${type}s found! Please select one from the list.\`\`\`prolog` +
                `\n${outputString}${moreLookup}--------------------` +
                '\nC.cancel query```' +
                `\n**${humanize.fullName(msg.author)}**, please type the number of the ${type} you wish to select below, or type \`c\` to cancel. This query will expire in 5 minutes.`,
                (msg2) => msg2.content.toLowerCase() === 'c' || parseInt(msg2.content) < lookupList.length + 1 && parseInt(msg2.content) >= 1,
                300000,
                args.label
            );
            const response = await query.response;
            if (query.prompt !== undefined)
                await query.prompt.channel.messages.delete(query.prompt.id);

            if (response === undefined || response.content.toLowerCase() === 'c') {
                if (args.suppress === true)
                    return undefined;

                if (args.onSendCallback !== undefined)
                    args.onSendCallback();

                await this.send(msg, `Query ${response !== undefined ? 'cancelled' : 'timed out'}${args.label !== undefined ? ' in ' + args.label : ''}.`);
                return undefined;
            }

            return lookupList[parseInt(response.content) - 1].value;
        } catch (err: unknown) {
            return undefined;
        }
    }

    public async awaitQuery(
        channel: TextBasedChannels,
        user: User,
        content: SendPayload,
        check?: ((message: Message) => boolean),
        timeoutMS?: number,
        label?: string
    ): Promise<Message | undefined> {
        const query = await this.createQuery(channel, user, content, check, timeoutMS, label);
        return await query.response;
    }

    public async createQuery(
        channel: TextBasedChannels,
        user: User,
        content: SendPayload,
        check?: ((message: Message) => boolean),
        timeoutMS = 300000,
        label?: string
    ): Promise<MessagePrompt> {
        const timeoutMessage = `Query canceled${label !== undefined ? ' in ' + label : ''} after ${moment.duration(timeoutMS).humanize()}.`;
        return this.createPrompt(channel, user, content, check, timeoutMS, timeoutMessage);
    }

    public async awaitPrompt(
        channel: TextBasedChannels,
        user: User,
        content: SendPayload,
        check?: ((message: Message) => boolean),
        timeoutMS?: number,
        timeoutMessage?: SendPayload
    ): Promise<Message | undefined> {
        const prompt = await this.createPrompt(channel, user, content, check, timeoutMS, timeoutMessage);
        return await prompt.response;
    }

    public async createPrompt(
        channel: TextBasedChannels,
        user: User,
        content: SendPayload,
        check: ((message: Message) => boolean) = () => true,
        timeoutMS = 300000,
        timeoutMessage?: SendPayload
    ): Promise<MessagePrompt> {
        const prompt = await this.send(channel, content);
        const response = channel.awaitMessages({
            filter: msg => msg.author.id === user.id && check(msg),
            max: 1,
            time: timeoutMS
        }).then(c => c.first());

        if (timeoutMessage !== undefined) {
            void response.then(async m => {
                if (m === undefined)
                    await this.send(channel, timeoutMessage);
            });
        }

        return {
            prompt,
            response
        };
    }

    /* eslint-disable @typescript-eslint/naming-convention */
    public async postStats(): Promise<void> {

        const stats = {
            server_count: this.discord.guilds.cache.size,
            shard_count: this.discord.ws.shards.size,
            shard_id: this.cluster.id
        };
        this.logger.log(stats);

        if (this.config.general.isbeta)
            return;

        const promises = [];
        if (this.config.general.botlisttoken.length > 0) {
            promises.push(
                fetch(`https://discord.bots.gg/api/v1/bots/${this.user.id}/stats`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'Authorization': this.config.general.botlisttoken,
                        'User-Agent': 'blargbot/1.0 (ratismal)'
                    },
                    body: JSON.stringify(stats)
                })
            );
        }

        if (this.config.general.carbontoken.length > 0) {
            promises.push(
                fetch('https://www.carbonitex.net/discord/data/botdata.php', {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json'
                    },
                    body: JSON.stringify({
                        'key': this.config.general.carbontoken,
                        'servercount': stats.server_count,
                        shard_count: stats.shard_count,
                        shard_id: stats.shard_id,
                        'logoid': this.user.avatar
                    })
                })
            );
        }

        if (this.config.general.botlistorgtoken.length > 0) {
            const shards = [];
            for (const shardId of this.discord.ws.shards.keys()) {
                shards[shardId] = this.discord.guilds.cache.filter(g => g.shard.id === shardId);
            }
            promises.push(
                fetch(`https://discordbots.org/api/bots/${this.user.id}/stats`, {
                    method: 'POST',
                    headers: {
                        'content-type': 'application/json',
                        'Authorization': this.config.general.botlistorgtoken,
                        'User-Agent': 'blargbot/1.0 (ratismal)'
                    },
                    body: JSON.stringify(shards)
                })
            );
        }

        if (promises.length > 0)
            this.logger.info('Posting to matt');

        for (const promise of promises) {
            try {
                await promise;
            } catch (err: unknown) {
                this.logger.error(err);
            }
        }
    }
    /* eslint-enable @typescript-eslint/naming-convention */

    public hasRole(msg: GuildMember | Message, roles: string | readonly string[], override = true): boolean {
        let member: GuildMember;
        if (msg instanceof GuildMember) {
            member = msg;
        } else {
            if (msg.member === null)
                return false;
            member = msg.member;
        }

        if (override
            && (member.id === this.cluster.config.discord.users.owner
                || member.guild.ownerId === member.id
                || member.permissions.has('ADMINISTRATOR')))
            return true;

        if (typeof roles === 'string')
            roles = [roles];

        return roles.some(r => member.roles.cache.has(r));
    }

    public isBotHigher(member: GuildMember): boolean {
        const bot = member.guild.me;
        if (bot === null)
            return false;
        const botPos = this.getPosition(bot);
        const memPos = this.getPosition(member);
        return botPos > memPos;
    }

    public getPosition(member: GuildMember): number {
        if (member.guild.ownerId === member.id)
            return Infinity;

        return member.roles.highest.position;
    }

    public async isUserStaff(userId: string, guildId: string): Promise<boolean> {
        if (userId === guildId) return true;

        const member = await this.getMemberById(guildId, userId);
        if (member === undefined) return false;

        if (member.guild.ownerId === userId) return true;
        if (member.permissions.has('ADMINISTRATOR')) return true;

        if (await this.database.guilds.getSetting(guildId, 'permoverride') === true) {
            let allow = await this.database.guilds.getSetting(guildId, 'staffperms') ?? defaultStaff;
            if (typeof allow === 'string')
                allow = parseInt(allow);
            if (this.hasPerms(member, allow)) {
                return true;
            }
        }
        return false;
    }

    public hasPerms(member: GuildMember, allow?: number | readonly PermissionString[]): boolean {
        allow ??= defaultStaff;
        const newPerm = new Permissions(typeof allow === 'number' ? BigInt(Math.floor(allow)) : allow);
        for (const key of newPerm.toArray()) {
            if (member.permissions.has(key)) {
                return true;
            }
        }
        return false;
    }

    public async hasRoles(msg: GuildMember | Message, roles: readonly string[], quiet: boolean, override = true): Promise<boolean> {
        let member: GuildMember;
        let channel: TextBasedChannels | undefined;
        if (msg instanceof GuildMember) {
            member = msg;
        } else {
            if (!guard.isGuildMessage(msg))
                return true;
            member = msg.member;
            channel = msg.channel;
        }
        if (override
            && (member.id === this.cluster.config.discord.users.owner
                || member.guild.ownerId === member.id
                || member.permissions.has('ADMINISTRATOR'))
        ) {
            return true;
        }

        roles = roles.map(p => p.toLowerCase());
        const guildRoles = member.guild.roles.cache.filter(m =>
            roles.includes(m.name.toLowerCase())
            || roles.some(p => parse.entityId(p, '@&', true) === m.id));

        if (guildRoles.some(r => member.roles.cache.has(r.id)))
            return true;

        if (channel !== undefined && !quiet) {
            if (await this.database.guilds.getSetting(member.guild.id, 'disablenoperms') !== true) {
                const permString = roles.map(m => '`' + m + '`').join(', or ');
                void this.send(channel, `You need the role ${permString} in order to use this command!`);
            }
        }
        return false;
    }

    public isStaff(id: string): boolean {
        return this.cluster.botStaff.staff.has(id);
    }

    public isSupport(id: string): boolean {
        return this.cluster.botStaff.support.has(id);
    }
}