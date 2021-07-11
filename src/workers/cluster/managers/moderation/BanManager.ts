import { Guild, Member, User } from 'eris';
import moment, { Duration } from 'moment-timezone';
import { BanResult, humanize, KickResult, mapping, MassBanResult, UnbanEventOptions, UnbanResult } from '../../core';
import { ModerationManager } from '../ModerationManager';
import { ModerationManagerBase } from './ModerationManagerBase';

export class BanManager extends ModerationManagerBase {
    private readonly ignoreBans: Set<`${string}:${string}`>;
    private readonly ignoreUnbans: Set<`${string}:${string}`>;

    public constructor(manager: ModerationManager) {
        super(manager);
        this.ignoreBans = new Set();
        this.ignoreUnbans = new Set();
    }

    public init(): void {
        this.cluster.timeouts.on('unban', event => void this.handleUnbanTimeout(event));
        this.cluster.discord.on('guildBanAdd', (guild, user) => void this.handleBanEvent(guild, user));
        this.cluster.discord.on('guildBanRemove', (guild, user) => void this.handleUnbanEvent(guild, user));
    }

    public async ban(guild: Guild, user: User, moderator: User, checkModerator: boolean, deleteDays = 1, reason?: string, duration?: Duration): Promise<BanResult> {
        const result = await this.tryBanUser(guild, user.id, moderator, checkModerator, undefined, deleteDays, reason);
        if (result !== 'success') {
            if (typeof result === 'string')
                return result;
            throw result.error;
        }

        if (duration === undefined) {
            await this.modlog.logBan(guild, user, moderator, reason);
        } else {
            await this.modlog.logSoftban(guild, user, duration, moderator, reason);
            await this.cluster.timeouts.insert('unban', {
                source: guild.id,
                guild: guild.id,
                user: user.id,
                duration: JSON.stringify(duration),
                endtime: moment().add(duration).valueOf()
            });
        }

        return 'success';
    }

    public async massBan(guild: Guild, userIds: string[], moderator: User, checkModerator: boolean, deleteDays = 1, reason?: string): Promise<MassBanResult> {
        if (userIds.length === 0)
            return 'noUsers';

        const self = guild.members.get(this.cluster.discord.user.id);
        if (self?.permissions.has('banMembers') !== true)
            return 'noPerms';

        if (checkModerator) {
            const permMessage = await this.checkModerator(guild, undefined, moderator.id, 'banMembers', 'banoverride');
            if (permMessage !== undefined)
                return permMessage;
        }

        const guildBans = new Set((await guild.getBans()).map(b => b.user.id));
        const banResults = await Promise.all(userIds.map(async userId => ({ userId, result: await this.tryBanUser(guild, userId, moderator, checkModerator, guildBans, deleteDays, reason) })));

        const bannedIds = new Set(banResults.filter(r => r.result === 'success').map(r => r.userId));
        if (bannedIds.size === 0) {
            const { result } = banResults[0];
            if (result === 'success')
                throw new Error('Filter failed to find a successful ban, yet here we are. Curious.');
            if (typeof result === 'string')
                return result;
            throw result;
        }
        const newBans = await guild.getBans();
        const banned = newBans.filter(b => !guildBans.has(b.user.id) && bannedIds.has(b.user.id)).map(b => b.user);

        await this.modlog.logMassBan(guild, banned, moderator);
        return banned;
    }

    private async tryBanUser(guild: Guild, userId: string, moderator: User, checkModerator: boolean, alreadyBanned?: Set<string>, deleteDays = 1, reason?: string): Promise<BanResult | { error: unknown; }> {
        const self = guild.members.get(this.cluster.discord.user.id);
        if (self?.permissions.has('banMembers') !== true)
            return 'noPerms';

        if (checkModerator) {
            const permMessage = await this.checkModerator(guild, userId, moderator.id, 'banMembers', 'banoverride');
            if (permMessage !== undefined)
                return permMessage;
        }

        const member = guild.members.get(userId);
        if (member !== undefined && !this.cluster.util.isBotHigher(member))
            return 'memberTooHigh';

        alreadyBanned ??= new Set((await guild.getBans()).map(b => b.user.id));
        if (alreadyBanned.has(userId))
            return 'alreadyBanned';

        this.ignoreBans.add(`${guild.id}:${userId}`);
        try {
            await guild.banMember(userId, deleteDays, `[${humanize.fullName(moderator)}] ${reason ?? ''}`);
        } catch (err: unknown) {
            this.ignoreBans.delete(`${guild.id}:${userId}`);
            return { error: err };
        }
        return 'success';
    }

    public async unban(guild: Guild, user: User, moderator: User, checkModerator: boolean, reason?: string): Promise<UnbanResult> {
        const self = guild.members.get(this.cluster.discord.user.id);
        if (self?.permissions.has('banMembers') !== true)
            return 'noPerms';

        if (checkModerator) {
            const permMessage = await this.checkModerator(guild, undefined, moderator.id, 'banMembers', 'banoverride');
            if (permMessage !== undefined)
                return permMessage;
        }

        const bans = await guild.getBans();
        if (bans.every(b => b.user.id !== user.id))
            return 'notBanned';

        this.ignoreUnbans.add(`${guild.id}:${user.id}`);
        await guild.unbanMember(user.id, `[${humanize.fullName(moderator)}] ${reason ?? ''}`);
        await this.modlog.logUnban(guild, user, moderator, reason);

        return 'success';
    }

    public async kick(member: Member, moderator: User, checkModerator: boolean, reason?: string): Promise<KickResult> {
        const self = member.guild.members.get(this.cluster.discord.user.id);
        if (self?.permissions.has('kickMembers') !== true)
            return 'noPerms';

        if (checkModerator) {
            const permMessage = await this.checkModerator(member.guild, member.id, moderator.id, 'kickMembers', 'kickoverride');
            if (permMessage !== undefined)
                return permMessage;
        }

        if (!this.cluster.util.isBotHigher(member))
            return 'memberTooHigh';

        await member.guild.kickMember(member.id, `[${humanize.fullName(moderator)}] ${reason ?? ''}`);
        await this.modlog.logKick(member.guild, member.user, moderator, reason);
        return 'success';
    }

    private async handleUnbanTimeout(event: UnbanEventOptions): Promise<void> {
        const guild = this.cluster.discord.guilds.get(event.guild);
        if (guild === undefined)
            return;

        const user = await this.cluster.util.getGlobalUser(event.user);
        if (user === undefined)
            return;

        const mapResult = mapDuration(event.duration);
        const duration = mapResult.valid ? humanize.duration(mapResult.value) : 'some time';

        await this.unban(guild, user, this.cluster.discord.user, false, `Automatically unbanned after ${duration}.`);
    }

    private async handleBanEvent(guild: Guild, user: User): Promise<void> {
        if (!this.ignoreBans.delete(`${guild.id}:${user.id}`))
            await this.modlog.logBan(guild, user);
    }

    private async handleUnbanEvent(guild: Guild, user: User): Promise<void> {
        if (!this.ignoreUnbans.delete(`${guild.id}:${user.id}`))
            await this.modlog.logUnban(guild, user);
    }
}

const mapDuration = mapping.json(mapping.duration);
