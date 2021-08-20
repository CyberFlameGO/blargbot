import { BaseGlobalCommand, CommandContext } from '@cluster/command';
import { avatarColours, CommandType, discordUtil, humanize, randChoose } from '@cluster/utils';
import discordjs, { MessageEmbedOptions } from 'discord.js';
import moment from 'moment';

export class StatsCommand extends BaseGlobalCommand {
    public constructor() {
        super({
            name: 'stats',
            category: CommandType.GENERAL,
            definitions: [
                {
                    parameters: '',
                    description: 'Gives you some information about me',
                    execute: (ctx) => this.execute(ctx)
                }
            ]
        });
    }

    public async execute(
        context: CommandContext
    ): Promise<void> {
        const clusterStats = Object.values(await discordUtil.cluster.getAllStats(context.cluster));
        const mappedStats = clusterStats.reduce<Record<string, number>>((a, c) => {
            return {
                guilds: a.guilds + c.guilds,
                users: a.users + c.users,
                channels: a.channels + c.channels,
                rss: a.rss + c.rss
            };
        }, {guilds: 0, users: 0, channels: 0, rss: 0});
        const version = await context.database.vars.get('version');
        const embed: MessageEmbedOptions = {
            color: randChoose(avatarColours),
            timestamp: moment().toDate(),
            title: 'Bot Statistics',
            footer: {
                text: 'blargbot',
                icon_url: context.discord.user.avatarURL() ?? undefined
            },
            fields: [{
                name: 'Guilds',
                value: mappedStats.guilds.toString(),
                inline: true
            },
            {
                name: 'Users',
                value: mappedStats.users.toString(),
                inline: true
            },
            {
                name: 'Channels',
                value: mappedStats.channels.toString(),
                inline: true
            },
            {
                name: 'Shards',
                value: context.config.discord.shards.max.toString(),
                inline: true
            },
            {
                name: 'Clusters',
                value: Math.ceil(context.config.discord.shards.max / context.config.discord.shards.perCluster).toString(),
                inline: true
            },
            {
                name: 'RAM',
                value: humanize.ram(mappedStats.rss),
                inline: true
            },
            {
                name: 'Version',
                value: `${version?.major ?? 0}.${version?.minor ?? 0}.${version?.patch ?? 0}`,
                inline: true
            },
            {
                name: 'Uptime',
                value: `<t:${context.cluster.createdAt.unix()}:R>`,
                inline: true
            },
            {
                name: 'Djs',
                value: discordjs.version,
                inline: true
            },
            {
                name: 'Node.js',
                value: process.version,
                inline: true
            }
            ]
        };

        await context.reply(embed);
    }
}