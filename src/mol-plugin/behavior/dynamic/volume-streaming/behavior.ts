/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { ParamDefinition as PD } from '../../../../mol-util/param-definition';
import { PluginStateObject } from '../../../state/objects';
import { VolumeIsoValue, VolumeData } from '../../../../mol-model/volume';
import { createIsoValueParam } from '../../../../mol-repr/volume/isosurface';
import { VolumeServerHeader, VolumeServerInfo } from './model';
import { Box3D } from '../../../../mol-math/geometry';
import { Vec3 } from '../../../../mol-math/linear-algebra';
import { Color } from '../../../../mol-util/color';
import { PluginBehavior } from '../../behavior';
import { LRUCache } from '../../../../mol-util/lru-cache';
import { urlCombine } from '../../../../mol-util/url';
import { CIF } from '../../../../mol-io/reader/cif';
import { volumeFromDensityServerData } from '../../../../mol-model-formats/volume/density-server';
import { PluginCommands } from '../../../command';
import { StateSelection } from '../../../../mol-state';
import { Representation } from '../../../../mol-repr/representation';
import { ButtonsType, ModifiersKeys } from '../../../../mol-util/input/input-observer';
import { StructureElement } from '../../../../mol-model/structure';
import { PluginContext } from '../../../context';
import { Binding } from '../../../../mol-util/binding';

const B = ButtonsType
const M = ModifiersKeys
const Trigger = Binding.Trigger

export class VolumeStreaming extends PluginStateObject.CreateBehavior<VolumeStreaming.Behavior>({ name: 'Volume Streaming' }) { }

export namespace VolumeStreaming {
    function channelParam(label: string, color: Color, defaultValue: VolumeIsoValue, stats: VolumeData['dataStats']) {
        return PD.Group({
            isoValue: createIsoValueParam(defaultValue, stats),
            color: PD.Color(color),
            wireframe: PD.Boolean(false),
            opacity: PD.Numeric(0.3, { min: 0, max: 1, step: 0.01 })
        }, { label, isExpanded: true });
    }

    const fakeSampling: VolumeServerHeader.Sampling = {
        byteOffset: 0,
        rate: 1,
        sampleCount: [1, 1, 1],
        valuesInfo: [{ mean: 0, min: -1, max: 1, sigma: 0.1 }, { mean: 0, min: -1, max: 1, sigma: 0.1 }]
    };

    const DefaultBindings = {
        clickVolumeAroundOnly: Binding(Trigger(B.Flag.Secondary, M.create()), 'Show the volume around only the clicked element.'),
    }

    export function createParams(data?: VolumeServerInfo.Data, defaultView?: ViewTypes) {
        // fake the info
        const info = data || { kind: 'em', header: { sampling: [fakeSampling], availablePrecisions: [{ precision: 0, maxVoxels: 0 }] }, emDefaultContourLevel: VolumeIsoValue.relative(0) };
        const box = (data && data.structure.boundary.box) || Box3D.empty();

        return {
            view: PD.MappedStatic(defaultView || (info.kind === 'em' ? 'cell' : 'selection-box'), {
                'off': PD.Group({}),
                'box': PD.Group({
                    bottomLeft: PD.Vec3(box.min),
                    topRight: PD.Vec3(box.max),
                }, { description: 'Static box defined by cartesian coords.', isFlat: true }),
                'selection-box': PD.Group({
                    radius: PD.Numeric(5, { min: 0, max: 50, step: 0.5 }),
                    bottomLeft: PD.Vec3(Vec3.create(0, 0, 0), { isHidden: true }),
                    topRight: PD.Vec3(Vec3.create(0, 0, 0), { isHidden: true }),
                }, { description: 'Box around last-interacted element.', isFlat: true }),
                'cell': PD.Group({}),
                // 'auto': PD.Group({  }), // TODO based on camera distance/active selection/whatever, show whole structure or slice.
            }, { options: [['off', 'Off'], ['box', 'Bounded Box'], ['selection-box', 'Surroundings'], ['cell', 'Whole Structure']] }),
            detailLevel: PD.Select<number>(Math.min(3, info.header.availablePrecisions.length - 1),
                info.header.availablePrecisions.map((p, i) => [i, `${i + 1} [ ${Math.pow(p.maxVoxels, 1 / 3) | 0}^3 cells ]`] as [number, string])),
            channels: info.kind === 'em'
                ? PD.Group({
                    'em': channelParam('EM', Color(0x638F8F), info.emDefaultContourLevel || VolumeIsoValue.relative(1), info.header.sampling[0].valuesInfo[0])
                }, { isFlat: true })
                : PD.Group({
                    '2fo-fc': channelParam('2Fo-Fc', Color(0x3362B2), VolumeIsoValue.relative(1.5), info.header.sampling[0].valuesInfo[0]),
                    'fo-fc(+ve)': channelParam('Fo-Fc(+ve)', Color(0x33BB33), VolumeIsoValue.relative(3), info.header.sampling[0].valuesInfo[1]),
                    'fo-fc(-ve)': channelParam('Fo-Fc(-ve)', Color(0xBB3333), VolumeIsoValue.relative(-3), info.header.sampling[0].valuesInfo[1]),
                }, { isFlat: true }),
            bindings: PD.Value(DefaultBindings, { isHidden: true }),
        };
    }

    export type ViewTypes = 'off' | 'box' | 'selection-box' | 'cell'

    export type ParamDefinition = typeof createParams extends (...args: any[]) => (infer T) ? T : never
    export type Params = ParamDefinition extends PD.Params ? PD.Values<ParamDefinition> : {}

    type CT = typeof channelParam extends (...args: any[]) => (infer T) ? T : never
    export type ChannelParams = CT extends PD.Group<infer T> ? T : {}

    type ChannelsInfo = { [name in ChannelType]?: { isoValue: VolumeIsoValue, color: Color, wireframe: boolean, opacity: number } }
    type ChannelsData = { [name in 'EM' | '2FO-FC' | 'FO-FC']?: VolumeData }

    export type ChannelType = 'em' | '2fo-fc' | 'fo-fc(+ve)' | 'fo-fc(-ve)'
    export const ChannelTypeOptions: [ChannelType, string][] = [['em', 'em'], ['2fo-fc', '2fo-fc'], ['fo-fc(+ve)', 'fo-fc(+ve)'], ['fo-fc(-ve)', 'fo-fc(-ve)']]
    export interface ChannelInfo {
        data: VolumeData,
        color: Color,
        wireframe: boolean,
        isoValue: VolumeIsoValue.Relative,
        opacity: number
    }
    export type Channels = { [name in ChannelType]?: ChannelInfo }

    export class Behavior extends PluginBehavior.WithSubscribers<Params> {
        private cache = LRUCache.create<ChannelsData>(25);
        public params: Params = {} as any;

        channels: Channels = {}

        private async queryData(box?: Box3D) {
            let url = urlCombine(this.info.serverUrl, `${this.info.kind}/${this.info.dataId.toLowerCase()}`);

            if (box) {
                const { min: a, max: b } = box;
                url += `/box`
                    + `/${a.map(v => Math.round(1000 * v) / 1000).join(',')}`
                    + `/${b.map(v => Math.round(1000 * v) / 1000).join(',')}`;
            } else {
                url += `/cell`;
            }
            url += `?detail=${this.params.detailLevel}`;

            let data = LRUCache.get(this.cache, url);
            if (data) {
                return data;
            }

            const cif = await this.plugin.runTask(this.plugin.fetch({ url, type: 'binary' }));
            data = await this.parseCif(cif as Uint8Array);
            if (!data) {
                return;
            }

            LRUCache.set(this.cache, url, data);
            return data;
        }

        private async parseCif(data: Uint8Array): Promise<ChannelsData | undefined> {
            const parsed = await this.plugin.runTask(CIF.parseBinary(data));
            if (parsed.isError) {
                this.plugin.log.error('VolumeStreaming, parsing CIF: ' + parsed.toString());
                return;
            }
            if (parsed.result.blocks.length < 2) {
                this.plugin.log.error('VolumeStreaming: Invalid data.');
                return;
            }

            const ret: ChannelsData = {};
            for (let i = 1; i < parsed.result.blocks.length; i++) {
                const block = parsed.result.blocks[i];

                const densityServerCif = CIF.schema.densityServer(block);
                const volume = await this.plugin.runTask(await volumeFromDensityServerData(densityServerCif));
                (ret as any)[block.header as any] = volume;
            }
            return ret;
        }

        private updateDynamicBox(ref: string, box: Box3D) {
            if (this.params.view.name !== 'selection-box') return;

            const state = this.plugin.state.dataState;
            const newParams: Params = {
                ...this.params,
                view: {
                    name: 'selection-box' as 'selection-box',
                    params: {
                        radius: this.params.view.params.radius,
                        bottomLeft: box.min,
                        topRight: box.max
                    }
                }
            };
            const update = state.build().to(ref).update(newParams);

            PluginCommands.State.Update.dispatch(this.plugin, { state, tree: update, options: { doNotUpdateCurrent: true } });
        }

        private getStructureRoot(ref: string) {
            return this.plugin.state.dataState.select(StateSelection.Generators.byRef(ref).rootOfType([PluginStateObject.Molecule.Structure]))[0];
        }

        register(ref: string): void {
            let lastLoci: Representation.Loci = Representation.Loci.Empty;

            this.subscribeObservable(this.plugin.events.state.object.removed, o => {
                if (!PluginStateObject.Molecule.Structure.is(o.obj) || lastLoci.loci.kind !== 'element-loci') return;
                if (lastLoci.loci.structure === o.obj.data) {
                    lastLoci = Representation.Loci.Empty;
                }
            });

            this.subscribeObservable(this.plugin.events.state.object.updated, o => {
                if (!PluginStateObject.Molecule.Structure.is(o.oldObj) || lastLoci.loci.kind !== 'element-loci') return;
                if (lastLoci.loci.structure === o.oldObj.data) {
                    lastLoci = Representation.Loci.Empty;
                }
            });

            this.subscribeObservable(this.plugin.behaviors.interaction.click, ({ current, buttons, modifiers }) => {
                if (this.params.view.name !== 'selection-box') return;
                if (!Binding.match(this.params.bindings.clickVolumeAroundOnly, buttons, modifiers)) return;

                if (current.loci.kind === 'empty-loci') {
                    this.updateDynamicBox(ref, Box3D.empty());
                    lastLoci = current;
                    return;
                }

                // TODO: support link and structure loci as well?
                if (!StructureElement.Loci.is(current.loci)) return;

                const parent = this.plugin.helpers.substructureParent.get(current.loci.structure);
                if (!parent) return;
                const root = this.getStructureRoot(ref);
                if (!root || !root.obj || root.obj !== parent.obj) return;

                if (Representation.Loci.areEqual(lastLoci, current)) {
                    lastLoci = Representation.Loci.Empty;
                    this.updateDynamicBox(ref, Box3D.empty());
                    return;
                }
                lastLoci = current;

                const loci = StructureElement.Loci.extendToWholeResidues(current.loci);
                const box = StructureElement.Loci.getBoundary(loci).box;
                this.updateDynamicBox(ref, box);
            });
        }

        async update(params: Params) {
            this.params = params;

            let box: Box3D | undefined = void 0, emptyData = false;

            switch (params.view.name) {
                case 'off':
                    emptyData = true;
                    break;
                case 'box':
                    box = Box3D.create(params.view.params.bottomLeft, params.view.params.topRight);
                    emptyData = Box3D.volume(box) < 0.0001;
                    break;
                case 'selection-box': {
                    box = Box3D.create(Vec3.clone(params.view.params.bottomLeft), Vec3.clone(params.view.params.topRight));
                    const r = params.view.params.radius;
                    emptyData = Box3D.volume(box) < 0.0001;
                    Box3D.expand(box, box, Vec3.create(r, r, r));
                    break;
                }
                case 'cell':
                    box = this.info.kind === 'x-ray'
                        ? this.info.structure.boundary.box
                        : void 0;
                    break;
            }

            const data = emptyData ? {} : await this.queryData(box);

            if (!data) return false;

            const info = params.channels as ChannelsInfo;

            if (this.info.kind === 'x-ray') {
                this.channels['2fo-fc'] = this.createChannel(data['2FO-FC'] || VolumeData.One, info['2fo-fc'], this.info.header.sampling[0].valuesInfo[0]);
                this.channels['fo-fc(+ve)'] = this.createChannel(data['FO-FC'] || VolumeData.One, info['fo-fc(+ve)'], this.info.header.sampling[0].valuesInfo[1]);
                this.channels['fo-fc(-ve)'] = this.createChannel(data['FO-FC'] || VolumeData.One, info['fo-fc(-ve)'], this.info.header.sampling[0].valuesInfo[1]);
            } else {
                this.channels['em'] = this.createChannel(data['EM'] || VolumeData.One, info['em'], this.info.header.sampling[0].valuesInfo[0]);
            }

            return true;
        }

        private createChannel(data: VolumeData, info: ChannelsInfo['em'], stats: VolumeData['dataStats']): ChannelInfo {
            const i = info!;
            return {
                data,
                color: i.color,
                wireframe: i.wireframe,
                opacity: i.opacity,
                isoValue: i.isoValue.kind === 'relative' ? i.isoValue : VolumeIsoValue.toRelative(i.isoValue, stats)
            };
        }

        getDescription() {
            if (this.params.view.name === 'selection-box') return 'Selection';
            if (this.params.view.name === 'box') return 'Static Box';
            if (this.params.view.name === 'cell') return 'Cell';
            return '';
        }

        constructor(public plugin: PluginContext, public info: VolumeServerInfo.Data) {
            super(plugin, {} as any);
        }
    }
}