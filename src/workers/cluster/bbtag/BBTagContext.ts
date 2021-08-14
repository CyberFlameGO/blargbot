import { ClusterUtilities } from '@cluster';
import { BBTagContextMessage, BBTagContextOptions, BBTagContextState, BBTagRuntimeScope, FindEntityOptions, FlagDefinition, FlagResult, RuntimeDebugEntry, RuntimeError, RuntimeLimit, RuntimeReturnState, SerializedBBTagContext, Statement, SubtagCall, SubtagHandler } from '@cluster/types';
import { bbtagUtil, guard, humanize, oldBu, parse } from '@cluster/utils';
import { Database } from '@core/database';
import { Logger } from '@core/Logger';
import { ModuleLoader } from '@core/modules';
import { Timer } from '@core/Timer';
import { NamedStoredGuildCommand, StoredTag } from '@core/types';
import { Client as Discord, Collection, Guild, GuildChannels, GuildMember, GuildTextBasedChannels, MessageAttachment, MessageEmbed, MessageEmbedOptions, Permissions, Role, User } from 'discord.js';
import { Duration } from 'moment-timezone';
import ReadWriteLock from 'rwlock';

import { BaseSubtag } from './BaseSubtag';
import { BBTagEngine } from './BBTagEngine';
import { CacheEntry, VariableCache } from './Caching';
import { limits } from './limits';
import { ScopeCollection } from './ScopeCollection';
import { TagCooldownManager } from './TagCooldownManager';

function serializeEntity(entity: { id: string; }): { id: string; serialized: string; } {
    return { id: entity.id, serialized: JSON.stringify(entity) };
}

export class BBTagContext implements Required<BBTagContextOptions> {
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    #isStaffPromise?: Promise<boolean>;

    public readonly message: BBTagContextMessage;
    public readonly inputRaw: string;
    public readonly input: string[];
    public readonly flags: readonly FlagDefinition[];
    public readonly isCC: boolean;
    public readonly tagVars: boolean;
    public readonly author: string;
    public readonly authorizer: string;
    public readonly rootTagName: string;
    public readonly tagName: string;
    public readonly cooldown: number;
    public readonly cooldowns: TagCooldownManager;
    public readonly locks: Record<string, ReadWriteLock | undefined>;
    public readonly limit: RuntimeLimit;
    // public readonly outputModify: (context: BBTagContext, output: string) => string;
    public readonly silent: boolean;
    public readonly execTimer: Timer;
    public readonly dbTimer: Timer;
    public readonly flaggedInput: FlagResult;
    public readonly errors: RuntimeError[];
    public readonly debug: RuntimeDebugEntry[];
    public readonly scopes: ScopeCollection;
    public readonly variables: VariableCache;
    public dbObjectsCommitted: number;
    public readonly state: BBTagContextState;

    public get totalDuration(): Duration { return this.execTimer.duration.add(this.dbTimer.duration); }
    public get channel(): GuildTextBasedChannels { return this.message.channel; }
    public get member(): GuildMember { return this.message.member; }
    public get guild(): Guild { return this.message.channel.guild; }
    public get user(): User { return this.message.author; }
    public get scope(): BBTagRuntimeScope { return this.scopes.local; }
    public get isStaff(): Promise<boolean> { return this.#isStaffPromise ??= this.engine.util.isUserStaff(this.authorizer, this.guild.id); }
    public get database(): Database { return this.engine.database; }
    public get logger(): Logger { return this.engine.logger; }
    public get permissions(): Permissions { return (this.guild.members.cache.get(this.authorizer) ?? { permissions: new Permissions(undefined) }).permissions; }
    public get util(): ClusterUtilities { return this.engine.util; }
    public get discord(): Discord<true> { return this.engine.discord; }
    public get subtags(): ModuleLoader<BaseSubtag> { return this.engine.subtags; }

    public constructor(
        public readonly engine: BBTagEngine,
        options: BBTagContextOptions
    ) {
        this.message = options.message;
        this.inputRaw = options.inputRaw;
        this.input = humanize.smartSplit(options.inputRaw);
        this.flags = options.flags ?? [];
        this.isCC = options.isCC;
        this.tagVars = options.tagVars ?? !this.isCC;
        this.author = options.author;
        this.authorizer = options.authorizer ?? this.author;
        this.rootTagName = options.rootTagName ?? 'unknown';
        this.tagName = options.tagName ?? this.rootTagName;
        this.cooldown = options.cooldown ?? 0;
        this.cooldowns = options.cooldowns ?? new TagCooldownManager();
        this.locks = options.locks ?? {};
        this.limit = options.limit;
        // this.outputModify = options.outputModify ?? ((_, r) => r);
        this.silent = options.silent ?? false;
        this.flaggedInput = parse.flags(this.flags, this.inputRaw);
        this.errors = [];
        this.debug = [];
        this.scopes = options.scopes ?? new ScopeCollection();
        this.variables = options.variables ?? new VariableCache(this);
        this.execTimer = new Timer();
        this.dbTimer = new Timer();
        this.dbObjectsCommitted = 0;
        this.state = {
            query: {
                count: 0,
                user: {},
                role: {},
                channel: {}
            },
            outputMessage: undefined,
            ownedMsgs: [],
            return: RuntimeReturnState.NONE,
            stackSize: 0,
            embed: undefined,
            file: undefined,
            reactions: [],
            nsfw: undefined,
            replace: undefined,
            break: 0,
            continue: 0,
            subtags: {},
            overrides: {},
            cache: {},
            subtagCount: 0,
            allowedMentions: {
                users: [],
                roles: [],
                everybody: false
            },
            ...options.state ?? {}
        };
    }

    public async eval(bbtag: Statement): Promise<string> {
        return await this.engine.eval(bbtag, this);
    }

    public ownsMessage(messageId: string): boolean {
        return messageId === this.message.id || this.state.ownedMsgs.includes(messageId);
    }

    public makeChild(options: Partial<BBTagContextOptions> = {}): BBTagContext {
        return new BBTagContext(this.engine, {
            ...this,
            ...options
        });
    }

    public addError(error: string, subtag?: SubtagCall, debugMessage?: string): string {
        this.errors.push({
            subtag: subtag,
            error: `${bbtagUtil.stringify(subtag?.name ?? ['UNKNOWN SUBTAG'])}: ${error}`,
            debugMessage: debugMessage
        });
        return this.scope.fallback ?? `\`${error}\``;
    }

    public async getUser(name: string, args: FindEntityOptions = {}): Promise<User | undefined> {
        if (this.state.query.count >= 5)
            args.quiet = args.suppress = true;
        if (args.onSendCallback !== undefined)
            args.onSendCallback = ((oldCallback) => () => {
                this.state.query.count++;
                oldCallback();
            })(args.onSendCallback);
        else
            args.onSendCallback = () => this.state.query.count++;

        const cached = this.state.query.user[name];
        if (cached !== undefined) {
            const user = await this.util.getUserById(cached);
            if (user !== undefined)
                return user;
            name = cached;
        }

        const user = await this.util.getUser(this.message, name, args);
        this.state.query.user[name] = user?.id;
        return user;
    }

    public async getRole(name: string, args: FindEntityOptions = {}): Promise<Role | undefined> {
        if (this.state.query.count >= 5)
            args.quiet = args.suppress = true;
        if (args.onSendCallback !== undefined)
            args.onSendCallback = ((oldCallback) => () => {
                this.state.query.count++;
                oldCallback();
            })(args.onSendCallback);
        else
            args.onSendCallback = () => this.state.query.count++;

        const cached = this.state.query.role[name];
        if (cached !== undefined)
            return await this.util.getRoleById(this.guild, cached) ?? undefined;

        const role = await this.engine.util.getRole(this.message, name, args);
        this.state.query.role[name] = role?.id;
        return role;
    }

    public async getChannel(name: string, args: FindEntityOptions = {}): Promise<GuildChannels | undefined> {
        if (this.state.query.count >= 5)
            args.quiet = args.suppress = true;
        if (args.onSendCallback !== undefined)
            args.onSendCallback = ((oldCallback) => () => {
                this.state.query.count++;
                oldCallback();
            })(args.onSendCallback);
        else
            args.onSendCallback = () => this.state.query.count++;

        const cached = this.state.query.channel[name];
        if (cached !== undefined)
            return await this.guild.channels.fetch(cached) ?? undefined;

        const channel = await this.engine.util.getChannel(this.message, name, args);
        if (channel === undefined || !guard.isGuildChannel(channel) || !guard.isTextableChannel(channel))
            return undefined;

        this.state.query.channel[name] = channel.id;
        return channel;
    }

    public override(subtag: string, handler: SubtagHandler): { previous?: SubtagHandler; revert: () => void; } {
        const overrides = this.state.overrides;
        if (!guard.hasProperty(overrides, subtag)) {
            overrides[subtag] = handler;
            return {
                revert() {
                    delete overrides[subtag];
                }
            };
        }

        const previous = overrides[subtag];
        overrides[subtag] = handler;
        return {
            previous,
            revert() {
                overrides[subtag] = previous;
            }
        };
    }

    public getLock(key: string): ReadWriteLock {
        return this.locks[key] ??= new ReadWriteLock();
    }

    private async _sendOutput(text: string): Promise<string | undefined> {
        let disableEveryone = true;
        if (this.isCC) {
            disableEveryone = await this.engine.database.guilds.getSetting(this.guild.id, 'disableeveryone') ?? false;
            disableEveryone ||= !this.state.allowedMentions.everybody;

            this.engine.logger.log('Allowed mentions:', this.state.allowedMentions, disableEveryone);
        }
        try {
            const response = await this.engine.util.send(this.message,
                {
                    content: text,
                    embeds: this.state.embed !== undefined ? [this.state.embed] : undefined,
                    nsfw: this.state.nsfw,
                    allowedMentions: {
                        parse: disableEveryone ? [] : ['everyone'],
                        roles: this.isCC ? this.state.allowedMentions.roles : undefined,
                        users: this.isCC ? this.state.allowedMentions.users : undefined
                    },
                    files: this.state.file !== undefined ? [this.state.file] : undefined
                });

            if (response !== undefined) {
                await oldBu.addReactions(response.channel.id, response.id, [...new Set(this.state.reactions)]);
                this.state.ownedMsgs.push(response.id);
                return response.id;
            }
            throw new Error(`Failed to send: ${text}`);
        } catch (err: unknown) {
            if (err instanceof Error) {
                if (err.message !== 'No content') {
                    throw err;
                }
                return undefined;
            }
            this.logger.error(`Failed to send: ${text}`, err);
            throw new Error(`Failed to send: ${text}`);
        }
    }

    public async sendOutput(text: string): Promise<string | undefined> {
        if (this.silent)
            return await this.state.outputMessage;
        return await (this.state.outputMessage ??= this._sendOutput(text));
    }

    public async getCached(key: `tag_${string}`, getIfNotSet: (key: string) => Promise<StoredTag | undefined>): Promise<StoredTag | null>;
    public async getCached(key: `cc_${string}`, getIfNotSet: (key: string) => Promise<NamedStoredGuildCommand | undefined>): Promise<NamedStoredGuildCommand | null>;
    public async getCached(key: string, getIfNotSet: (key: string) => Promise<NamedStoredGuildCommand | StoredTag | undefined>): Promise<NamedStoredGuildCommand | StoredTag | null> {
        key = key.split('_').slice(1).join('_');
        if (key in this.state.cache)
            return this.state.cache[key];
        const fetchedValue = await getIfNotSet(key);
        if (fetchedValue !== undefined)
            return this.state.cache[key] = fetchedValue;
        return this.state.cache[key] = null;
    }

    public static async deserialize(engine: BBTagEngine, obj: SerializedBBTagContext): Promise<BBTagContext> {
        let message: BBTagContextMessage | undefined;
        try {
            const msg = await engine.util.getGlobalMessage(obj.msg.channel.id, obj.msg.id);
            if (msg === undefined || !guard.isGuildMessage(msg))
                throw new Error('Channel must be a guild channel to work with BBTag');
            message = msg;
        } catch (err: unknown) {
            const channel = await engine.util.getGlobalChannel(obj.msg.channel.id);
            if (channel === undefined || !guard.isGuildChannel(channel))
                throw new Error('Channel must be a guild channel to work with BBTag');
            if (!guard.isTextableChannel(channel))
                throw new Error('Channel must be able to send and receive messages to work with BBTag');
            const member = await engine.util.getMemberById(channel.guild.id, obj.msg.member.id);
            if (member === undefined)
                throw new Error(`User ${obj.msg.member.id} doesnt exist on ${channel.guild.id} any more`);

            message = {
                id: obj.msg.id,
                createdTimestamp: obj.msg.timestamp,
                content: obj.msg.content,
                channel: channel,
                member,
                author: member.user,
                attachments: new Collection(obj.msg.attachments.map(att => [att.id, new MessageAttachment(att.url, att.name)])),
                embeds: obj.msg.embeds.map(e => new MessageEmbed(e))
            };
        }
        const limit = new limits[obj.limit.type]();
        limit.load(obj.limit);
        const result = new BBTagContext(engine, {
            inputRaw: obj.inputRaw,
            message: message,
            isCC: obj.isCC,
            rootTagName: obj.rootTagName,
            tagName: obj.tagName,
            author: obj.author,
            authorizer: obj.authorizer,
            state: obj.state,
            limit: limit,
            tagVars: obj.tagVars
        });
        Object.assign(result.scopes.local, obj.scope);

        result.state.cache = {};
        result.state.overrides = {};

        for (const key of Object.keys(obj.tempVars))
            await result.variables.set(key, new CacheEntry(result, key, obj.tempVars[key]));
        return result;
    }

    public serialize(): SerializedBBTagContext {
        const newState = { ...this.state, cache: undefined, overrides: undefined };
        const newScope = { ...this.scope };
        return {
            msg: {
                id: this.message.id,
                timestamp: this.message.createdTimestamp,
                content: this.message.content,
                channel: serializeEntity(this.channel),
                member: serializeEntity(this.member),
                attachments: this.message.attachments.map(a => ({ id: a.id, name: a.name ?? 'file', url: a.url })),
                embeds: this.message.embeds.map(e => <MessageEmbedOptions>e.toJSON())
            },
            isCC: this.isCC,
            state: newState,
            scope: newScope,
            inputRaw: this.inputRaw,
            flaggedInput: this.flaggedInput,
            rootTagName: this.rootTagName,
            tagName: this.tagName,
            tagVars: this.tagVars,
            author: this.author,
            authorizer: this.authorizer,
            limit: this.limit.serialize(),
            tempVars: this.variables.list
                .filter(v => v.key.startsWith('~'))
                .reduce<Record<string, JToken>>((p, v) => {
                    p[v.key] = v.value;
                    return p;
                }, {})
        };
    }
}