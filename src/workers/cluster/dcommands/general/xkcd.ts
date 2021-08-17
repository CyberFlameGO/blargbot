import { BaseGlobalCommand, CommandContext } from '@cluster/command';
import { CommandType, mapping, randInt } from '@cluster/utils';
import { MessageEmbedOptions } from 'discord.js';
import fetch from 'node-fetch';

export class XKCDCommand extends BaseGlobalCommand {
    public constructor() {
        super({
            name: 'xkcd',
            category: CommandType.GENERAL,
            definitions: [
                {
                    parameters: '{comicNumber:number?}',
                    description: 'Gets an xkcd comic. If a number is not specified, gets a random one.',
                    execute: (ctx, [comicNumber]) => this.getComic(ctx, comicNumber)
                }
            ]
        });
    }

    public async getComic(context: CommandContext, comicNumber: number | undefined): Promise<string | MessageEmbedOptions> {
        if (comicNumber === undefined) {
            const comic = await this.requestComic(undefined);
            if (comic === undefined)
                return this.error('Seems like xkcd is down 😟');
            comicNumber = randInt(0, comic.num);
        }

        const comic = await this.requestComic(comicNumber);
        if (comic === undefined)
            return this.error('Seems like xkcd is down 😟');

        return {
            author: context.util.embedifyAuthor(context.author),
            title: `xkcd #${comic.num}: ${comic.title}`,
            description: comic.alt,
            image: { url: comic.img },
            footer: { text: `xkcd ${comic.year}` }
        };
    }

    private async requestComic(comicNumber: number | undefined): Promise<ComicInfo | undefined> {
        const response = await fetch(`http://xkcd.com/${comicNumber === undefined ? '' : `${comicNumber}/`}info.0.json`);
        const body = await response.json() as unknown;
        const info = comicInfoMapping(body);
        return info.valid ? info.value : undefined;
    }
}

interface ComicInfo {
    num: number;
    title: string;
    year: string;
    alt: string;
    img: string;
}

const comicInfoMapping = mapping.mapObject<ComicInfo>({
    num: mapping.mapNumber,
    title: mapping.mapString,
    year: mapping.mapString,
    alt: mapping.mapString,
    img: mapping.mapString
});