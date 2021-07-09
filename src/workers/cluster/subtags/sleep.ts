import moment from 'moment';
import { BaseSubtag, BBTagContext, parse, sleep, SubtagCall, SubtagType } from '../core';

const maxSleep = moment.duration(5, 'minutes');

export class SleepTag extends BaseSubtag {
    public constructor() {
        super({
            name: 'sleep',
            category: SubtagType.COMPLEX,
            definition: [
                {
                    parameters: ['duration'],
                    description: 'Pauses the current tag for the specified amount of time. Maximum is 5 minutes',
                    exampleCode: '{sleep;10s}{send;{channelid};Hi!}',
                    exampleOut: '(After 10s) Hi!',
                    execute: (ctx, [duration], subtag) => this.sleep(ctx, duration.value, subtag)
                }
            ]
        });
    }
    public async sleep(context: BBTagContext, duration: string, subtag: SubtagCall): Promise<void | string> {
        let delay = parse.duration(duration);
        if (delay === undefined)
            return context.addError('Invalid duration', subtag);

        if (delay.asMilliseconds() > maxSleep.asMilliseconds())
            delay = maxSleep;

        await sleep(delay.asMilliseconds());
    }
}