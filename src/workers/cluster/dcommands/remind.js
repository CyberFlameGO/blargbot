const BaseCommand = require('../structures/BaseCommand');
const moment = require('moment-timezone');
const newbutils = require('../newbu');

class RemindCommand extends BaseCommand {
    constructor() {
        super({
            name: 'remind',
            aliases: ['remindme'],
            category: newbutils.commandTypes.GENERAL,
            usage: 'remind <text> -t <time>',
            info: 'Reminds you about something after a period of time in a DM.',
            flags: [{
                flag: 't',
                word: 'time',
                desc: 'The time before the user is to be reminded, formatted as \'1 day 2 hours 3 minutes and 4 seconds\', \'1d2h3m4s\', or some other combination.'
            },
            {
                flag: 'c',
                word: 'channel',
                desc: 'If set, this will notify the user in current channel instead of in a DM.'
            }]
        });
    }

    async execute(msg, words) {
        const example = '`remind Do a thing! -t 1 day, two hours`';

        let input = newbutils.parse.flags(this.flags, words);
        let duration = moment.duration();
        if (input.t && input.t.length > 0) duration = bu.parseDuration(input.t.join(' '));

        if (duration.asMilliseconds() == 0) {
            bu.send(msg, `Hey, you didn't give me a period of time to remind you after!
Example: ${example}`);
            return;
        }
        if (input.undefined.length == 0) {
            bu.send(msg, `Hey, you didn't tell me what I should remind you!
Example: ${example}`);
            return;
        }

        let channel;
        if (input.c) channel = msg.channel.id;
        await bu.events.insert({
            type: 'remind',
            source: channel ? msg.guild.id : msg.author.id,
            user: msg.author.id,
            content: input.undefined.join(' '),
            channel: channel,
            starttime: r.epochTime(moment().unix()),
            endtime: r.epochTime(moment().add(duration).unix())
        });
        await bu.send(msg, `:alarm_clock: Ok! I'll remind you ${channel ? 'here' : 'in a DM'} ${duration.humanize(true)}! :alarm_clock: `);
    }

    async event(args) {
        let duration = moment.duration(moment() - moment(args.starttime));
        duration.subtract(duration * 2);
        if (args.channel) {
            bu.send(args.channel, {
                content: `:alarm_clock: Hi, <@${args.user}>! You asked me to remind you about this ${duration.humanize(true)}:
${args.content}`,
                allowedMentions: {
                    users: [args.user]
                }
            });
        } else {
            bu.sendDM(args.user, `:alarm_clock: Hi! You asked me to remind you about this ${duration.humanize(true)}:
    ${args.content}`);
        }
    }
}

module.exports = RemindCommand;