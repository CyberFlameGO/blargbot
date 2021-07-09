import { BaseImageGenerator, randInt, JimpGifEncoder, Logger, mapping, TriggeredOptions } from '../core';
import Jimp from 'jimp';

export class TriggeredGenerator extends BaseImageGenerator<'triggered'> {
    public constructor(logger: Logger) {
        super('triggered', logger, mapOptions);
    }

    public async executeCore({ avatar, inverted, horizontal, vertical, sepia, blur, greyscale }: TriggeredOptions): Promise<Buffer> {
        const frameCount = 8;
        const avatarImg = await this.getRemoteJimp(avatar);
        avatarImg.resize(320, 320);
        if (inverted)
            avatarImg.invert();
        if (horizontal)
            avatarImg.flip(true, false);
        if (vertical)
            avatarImg.flip(false, true);
        if (sepia)
            avatarImg.sepia();
        if (blur)
            avatarImg.blur(10);
        if (greyscale)
            avatarImg.greyscale();

        const triggered = await this.getLocalJimp('triggered.png');
        triggered.resize(280, 60);
        triggered.opacity(0.8);
        const overlay = await this.getLocalJimp('red.png');

        let frame;
        let x;
        let y;
        const base = new Jimp(256, 256);
        const gif = new JimpGifEncoder({ width: 256, height: 256 });
        for (let i = 0; i < frameCount; i++) {
            frame = base.clone();
            if (i === 0) {
                x = -16;
                y = -16;
            } else {
                x = -32 + randInt(-16, 16);
                y = -32 + randInt(-16, 16);
            }
            frame.composite(avatarImg, x, y);
            if (i === 0) {
                x = -10;
                y = 200;
            } else {
                x = -12 + randInt(-8, 8);
                y = 200 + randInt(-0, 12);
            }
            frame.composite(overlay, 0, 0);
            frame.composite(triggered, x, y);
            gif.addFrame(frame);
        }
        return await gif.render();
    }

}

const mapOptions = mapping.object<TriggeredOptions>({
    avatar: mapping.string,
    inverted: mapping.boolean,
    horizontal: mapping.boolean,
    vertical: mapping.boolean,
    sepia: mapping.boolean,
    blur: mapping.boolean,
    greyscale: mapping.boolean
});