import Jimp from 'jimp';
import { BaseImageGenerator, CAHOptions, Logger, mapping } from '../core';

export class CAHGenerator extends BaseImageGenerator<'cah'> {
    public constructor(logger: Logger) {
        super('cah', logger, mapOptions);
    }

    public async executeCore({ white, black }: CAHOptions): Promise<Buffer | null> {
        const blackCard = await this.getLocalJimp('blackcard.png');
        const whiteCard = await this.getLocalJimp('whitecard.png');

        const finalImg = new Jimp(183 * (white.length + 1), 254);
        const blackCaption = await this.renderJimpText(black, {
            font: 'arial.ttf',
            fill: '#ffffff',
            size: '144x190',
            gravity: 'northwest'
        });
        finalImg.composite(blackCard, 0, 0);
        finalImg.composite(blackCaption, 19, 19);

        for (let i = 0; i < white.length; i++) {
            const w = white[i];
            if (typeof w !== 'string')
                continue;

            const whiteCaption = await this.renderJimpText(w, {
                font: 'arial.ttf',
                fill: 'black',
                size: '144x190',
                gravity: 'northwest'
            });
            finalImg.composite(whiteCard, 183 * (i + 1), 0);
            finalImg.composite(whiteCaption, 183 * (i + 1) + 19, 19);
        }

        return await finalImg.getBufferAsync(Jimp.MIME_PNG);
    }
}

const mapOptions = mapping.object<CAHOptions>({
    white: mapping.array(mapping.string),
    black: mapping.string
});