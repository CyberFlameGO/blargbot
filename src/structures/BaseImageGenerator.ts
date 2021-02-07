import Jimp from 'jimp';
import phantom from 'phantom';
import path from 'path';
import request, { RequiredUriUrl, CoreOptions, Response } from 'request';
import gm from 'gm';

const im = gm.subClass({
    imageMagick: true
});

type MagickSource = string | Jimp | Buffer | gm.State | [width: number, height: number, color?: string];

interface TextOptions {
    font?: string;
    fontsize?: number;
    size?: string;
    fill?: string;
    gravity?: string;
    stroke?: string;
    strokewidth?: string
}

interface PhantomOptions {
    replacements?: { [elementId: string]: string },
    scale?: number;
    format?: string;
}

interface PhantomTransformOptions<T> extends PhantomOptions {
    transform: (arg: T) => void;
    transformArg: T;
}

export abstract class BaseImageGenerator {
    public constructor(
        public readonly logger: CatLogger
    ) {
    }

    public abstract execute(message: JObject): Promise<Buffer | null>;

    protected getLocalResourcePath(...segments: string[]): string {
        return path.join(__dirname, '..', '..', 'res', 'img', ...segments);
    }

    protected getLocalJimp(...segments: string[]): Promise<Jimp> {
        return Jimp.read(this.getLocalResourcePath(...segments));
    }

    protected toImageData(source: Jimp): ImageData {
        return new ImageData(
            new Uint8ClampedArray(source.bitmap.data),
            source.bitmap.width,
            source.bitmap.height);
    }

    protected toBuffer(source: gm.State, format?: string): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            source.setFormat(format || 'png').toBuffer((err, buffer) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(buffer);
            });
        });
    }

    protected async getRemoteJimp(url: string): Promise<Jimp> {
        return await Jimp.read(await this.getRemote(url));
    }

    protected async getRemote(url: string): Promise<Buffer> {

        url = url.trim();
        if (url.startsWith('<') && url.endsWith('>')) {
            url = url.substring(1, url.length - 1);
        }

        this.logger.debug(url);
        const r = await aRequest({ uri: url });

        if (r.res.headers['content-type'] == 'image/gif') {
            return await this.toBuffer(
                gm(r.body, 'temp.gif')
                    .selectFrame(1)
                    .setFormat('png'));
        } else if (r.res.headers['content-type'] == 'image/png' ||
            r.res.headers['content-type'] == 'image/jpeg' ||
            r.res.headers['content-type'] == 'image/bmp') {
            return r.body;
        } else {
            throw new Error('Wrong file type!');
        }
    }

    protected async generate(source: MagickSource, configure: (image: gm.State) => (Promise<void> | void)): Promise<Buffer> {
        if (typeof source === 'string')
            source = im(source);
        else if (Array.isArray(source))
            source = im(...source);
        else if (isJimp(source))
            source = im(await source.getBufferAsync(Jimp.MIME_PNG));
        else if (source instanceof Buffer)
            source = im(source);
        else if (isGm(source))
            source = source;
        else
            throw new Error(`Unable to read ${source} into imagemagick`);

        source.command('convert');
        await configure(source);

        return await this.toBuffer(source);
    }

    protected async generateJimp(source: MagickSource, configure: (image: gm.State) => (Promise<void> | void)): Promise<Jimp> {
        return await Jimp.read(await this.generate(source, configure));
    }

    protected renderJimpText(text: string, options: TextOptions): Promise<Jimp> {
        if (!text)
            throw new Error('No text provided');

        if (!options.fill)
            options.fill = 'black';
        if (!options.gravity)
            options.gravity = 'Center';

        this.logger.debug(`Generating caption for text '${text}'`);

        const { fill, gravity, font, fontsize, size, stroke, strokewidth } = options;

        return this.generateJimp(Buffer.from(''), image => {
            if (font !== undefined)
                image.font(this.getLocalResourcePath('fonts', font), fontsize);

            if (size !== undefined)
                image.out('-size').out(size);

            image.out('-background').out('transparent');
            image.out('-fill').out(fill);
            image.out('-gravity').out(gravity);
            if (stroke !== undefined) {
                image.out('-stroke').out(stroke);
                if (strokewidth !== undefined)
                    image.out('-strokewidth').out(strokewidth);
            }
            image.out(`caption:${text}`);
            if (stroke !== undefined) {
                image.out('-compose').out('Over');
                if (size !== undefined)
                    image.out('-size').out(size);
                image.out('-background').out('transparent');
                image.out('-fill').out(fill);
                image.out('-gravity').out(gravity);
                image.out('-stroke').out('none');
                image.out(`caption:${text}`);
                image.out('-composite');
            }
            image.setFormat('png');
        });
    }

    protected async renderPhantom(file: string, options: PhantomOptions): Promise<Buffer>
    protected async renderPhantom<T>(file: string, options: PhantomTransformOptions<T>): Promise<Buffer>
    protected async renderPhantom(file: string, options: Partial<PhantomTransformOptions<unknown>>): Promise<Buffer> {
        const { replacements, scale = 1, format = 'PNG', transform, transformArg } = options;
        const instance = await phantom.create(['--ignore-ssl-errors=true', '--ssl-protocol=TLSv1']);
        const page = await instance.createPage();

        const dPath = this.getLocalResourcePath(file).replace(/\\/g, '/').replace(/^\w:/, '');
        await page.on('onConsoleMessage', (msg) => this.logger.debug('[IM]', msg));
        await page.on('onResourceError', (resourceError) => this.logger.error(`${resourceError.url}: ${resourceError.errorString}`));
        await page.open(dPath);
        await page.on('viewportSize', { width: 1440, height: 900 });
        await page.on('zoomFactor', scale);

        const rect = await page.evaluate(phantom_getrect, replacements);

        if (rect) {
            await page.on('clipRect', {
                top: rect.top,
                left: rect.left,
                width: rect.width * scale,
                height: rect.height * scale
            });
        }

        if (transform)
            await page.evaluate(transform, transformArg);

        await page.evaluate(phantom_resize);

        const base64 = await page.renderBase64(format);
        instance.exit();
        return Buffer.from(base64);
    }
}

function phantom_getrect(replacements: PhantomOptions['replacements']): { top: number, left: number, width: number, height: number } | undefined {
    if (replacements) {
        const keys = Object.keys(replacements);
        for (let i = 0; i < keys.length; i++) {
            const thing = document.getElementById(keys[i]);
            if (thing)
                thing.innerText = replacements[keys[i]];
        }
    }
    try {
        const workspace = document.getElementById('workspace');
        return workspace?.getBoundingClientRect();
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(err); // console inside the phantom browser, not the blargbot console
        return { top: 0, left: 0, width: 300, height: 300 };
    }
}

function phantom_resize(): void {
    let el, i;
    const elements = document.getElementsByClassName('resize');
    const wrapper = document.getElementById('wrapper');
    if (elements.length < 0 || wrapper === null) {
        return;
    }

    const resizeText = function (el: HTMLElement): void {
        const elNewFontSize = `${parseInt(el.style.fontSize.slice(0, -2)) - 1}px`;
        // eslint-disable-next-line no-console
        console.log(elNewFontSize); // console inside the phantom browser, not the blargbot console
        el.style.fontSize = elNewFontSize;
    };

    for (i = 0; i < elements.length; i++) {
        el = elements[i];
        if (el instanceof HTMLElement) {
            if (el.style.fontSize === '')
                el.style.fontSize = '65px';


            let ii = 0;
            while (el.scrollHeight > wrapper.clientHeight) {
                resizeText(el);
                if (++ii == 1000)
                    break;
            }
        }
    }
}

function aRequest(obj: RequiredUriUrl & CoreOptions): Promise<{ res: Response, body: Buffer }> {
    return new Promise<{ res: Response, body: Buffer }>((resolve, reject) => {
        if (!obj.encoding)
            obj.encoding = null;

        request(obj, (err, res, body) => {
            if (err) {
                reject(err);
                return;
            }
            resolve({
                res: res,
                body: body
            });
        });
    });
}

function isJimp(source: MagickSource): source is Jimp {
    return source instanceof Jimp;
}

function isGm(source: MagickSource): source is gm.State {
    return source instanceof gm;
}