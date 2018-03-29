/*
 * @Author: stupid cat
 * @Date: 2017-05-07 18:51:11
 * @Last Modified by: stupid cat
 * @Last Modified time: 2018-03-19 22:59:32
 *
 * This project uses the AGPLv3 license. Please read the license file before using/adapting any of the code.
 */

const Builder = require('../structures/TagBuilder');

module.exports =
    Builder.AutoTag('randchoose')
        .acceptsArrays()
        .withArgs(a => a.require('choices', true))
        .withDesc('Picks one random entry from `choices`. If an array is supplied, it will be exapnded to its individual elements')
        .withExample(
            'I feel like eating {randchoose;cake;pie;pudding} today',
            'I feel like eating pudding today.'
        )
        .whenArgs('1', Builder.errors.notEnoughArguments)
        .whenArgs('2', async function (params) {
            let value = await bu.processTagInner(params, 1);
            let options = await bu.getArray(params, value);
            if (options == null || !Array.isArray(options.v))
                return value;
            let selection = bu.getRandomInt(0, options.v.length - 1);
            return options.v[selection];
        })
        .whenDefault(async function (params) {
            let selection = bu.getRandomInt(1, params.args.length - 1);
            return await bu.processTagInner(params, selection);
        })
        .build();