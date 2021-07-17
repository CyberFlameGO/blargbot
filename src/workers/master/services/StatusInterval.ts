import { BotActivityType } from 'eris';
import moment from 'moment';
import { CronService, guard, MasterOptions } from '@master/core';
import { Master } from '../Master';

export class StatusInterval extends CronService {
    // eslint-disable-next-line @typescript-eslint/explicit-member-accessibility
    readonly #holidays: Record<string, string>;
    public readonly type = 'discord';

    public constructor(
        public readonly master: Master,
        { holidays }: MasterOptions
    ) {
        super({ cronTime: '*/15 * * * *' }, master.logger);
        this.#holidays = holidays;
    }

    protected execute(): void {
        let name = '';
        let type: BotActivityType = 0;

        const date = moment().format('MM-DD');
        if (guard.hasProperty(this.#holidays, date)) {
            name = this.#holidays[date];
        } else {
            const game = games[Math.floor(Math.random() * games.length)];
            name = game.name;
            type = game.type ?? 0;
        }

        this.master.discord.editStatus('online', { name, type });
    }
}

const games: Array<{ name: string; type?: BotActivityType; }> = [
    { name: 'with tiny bits of string!' },
    { name: 'with a mouse!' },
    { name: 'with a laser pointer!', type: 3 },
    { name: 'with a ball of yarn!' },
    { name: 'in a box!' },
    { name: 'the pitter-patter of tiny feet.', type: 2 }
];
