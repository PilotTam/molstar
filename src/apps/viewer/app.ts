/**
 * Copyright (c) 2018-2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { G3DFormat, G3dProvider } from '../../extensions/g3d/format';
import { VolsegVolumeServerConfig } from '../../extensions/volumes-and-segmentations';
// import { Volume } from '../../mol-model/volume';
import { DownloadStructure, /*PdbDownloadProvider*/ } from '../../mol-plugin-state/actions/structure';
// import { DownloadDensity } from '../../mol-plugin-state/actions/volume';
import { PresetTrajectoryHierarchy } from '../../mol-plugin-state/builder/structure/hierarchy-preset';
import { StructureRepresentationPresetProvider } from '../../mol-plugin-state/builder/structure/representation-preset';
import { DataFormatProvider } from '../../mol-plugin-state/formats/provider';
import { BuiltInTopologyFormat } from '../../mol-plugin-state/formats/topology';
import { BuiltInCoordinatesFormat } from '../../mol-plugin-state/formats/coordinates';
import { BuiltInTrajectoryFormat } from '../../mol-plugin-state/formats/trajectory';
// import { BuildInVolumeFormat } from '../../mol-plugin-state/formats/volume';
// import { createVolumeRepresentationParams } from '../../mol-plugin-state/helpers/volume-representation-params';
// import { PluginStateObject } from '../../mol-plugin-state/objects';
// import { StateTransforms } from '../../mol-plugin-state/transforms';
import { TrajectoryFromModelAndCoordinates } from '../../mol-plugin-state/transforms/model';
import { createPluginUI } from '../../mol-plugin-ui/react18';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec, PluginUISpec } from '../../mol-plugin-ui/spec';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginConfig } from '../../mol-plugin/config';
import { PluginLayoutControlsDisplay } from '../../mol-plugin/layout';
import { StateObjectRef, StateObjectSelector } from '../../mol-state';
import { Asset } from '../../mol-util/assets';
import { Color } from '../../mol-util/color';
import '../../mol-util/polyfill';
import { SaccharideCompIdMapType } from '../../mol-model/structure/structure/carbohydrates/constants';
import { AnimateModelIndex } from '../../mol-plugin-state/animation/built-in/model-index';
export { PLUGIN_VERSION as version } from '../../mol-plugin/version';
export { setDebugMode, setProductionMode, setTimingMode, consoleStats } from '../../mol-util/debug';
export { setSubtreeVisibility } from '../../mol-plugin/behavior/static/state';
import { MolScriptBuilder as MS } from '../../mol-script/language/builder';
import { PluginSpec } from '../../mol-plugin/spec';
import { ObjectKeys } from '../../mol-util/type-helpers';
import { Script } from '../../mol-script/script';
import { Structure, StructureElement, StructureProperties } from '../../mol-model/structure';
import { StructureSelection } from '../../mol-model/structure/query';
import { LociEntry } from '../../mol-plugin-ui/structure/superposition';
import { elementLabel, structureElementStatsLabel } from '../../mol-theme/label';
import { stripTags } from '../../mol-util/string';
import { alignAndSuperpose } from '../../mol-model/structure/structure/util/superposition';
import { PluginStateObject } from '../../mol-plugin-state/objects';
import { Mat4 } from '../../mol-math/linear-algebra';
import { StateTransforms } from '../../mol-plugin-state/transforms';
import { SymmetryOperator } from '../../mol-math/geometry';
import { setSubtreeVisibility } from '../../mol-plugin/behavior/static/state';

const CustomFormats = [
    ['g3d', G3dProvider] as const
];

const Extensions = {
    'g3d': PluginSpec.Behavior(G3DFormat),
};

const DefaultViewerOptions = {
    customFormats: CustomFormats as [string, DataFormatProvider][],
    extensions: ObjectKeys(Extensions),
    layoutIsExpanded: true,
    layoutShowControls: true,
    layoutShowRemoteState: true,
    layoutControlsDisplay: 'reactive' as PluginLayoutControlsDisplay,
    layoutShowSequence: true,
    layoutShowLog: true,
    layoutShowLeftPanel: true,
    collapseLeftPanel: false,
    collapseRightPanel: false,
    disableAntialiasing: PluginConfig.General.DisableAntialiasing.defaultValue,
    pixelScale: PluginConfig.General.PixelScale.defaultValue,
    pickScale: PluginConfig.General.PickScale.defaultValue,
    pickPadding: PluginConfig.General.PickPadding.defaultValue,
    enableWboit: PluginConfig.General.EnableWboit.defaultValue,
    enableDpoit: PluginConfig.General.EnableDpoit.defaultValue,
    preferWebgl1: PluginConfig.General.PreferWebGl1.defaultValue,
    allowMajorPerformanceCaveat: PluginConfig.General.AllowMajorPerformanceCaveat.defaultValue,
    powerPreference: PluginConfig.General.PowerPreference.defaultValue,

    viewportShowExpand: PluginConfig.Viewport.ShowExpand.defaultValue,
    viewportShowControls: PluginConfig.Viewport.ShowControls.defaultValue,
    viewportShowSettings: PluginConfig.Viewport.ShowSettings.defaultValue,
    viewportShowSelectionMode: PluginConfig.Viewport.ShowSelectionMode.defaultValue,
    viewportShowAnimation: PluginConfig.Viewport.ShowAnimation.defaultValue,
    viewportShowTrajectoryControls: PluginConfig.Viewport.ShowTrajectoryControls.defaultValue,
    pluginStateServer: PluginConfig.State.DefaultServer.defaultValue,
    volumeStreamingServer: PluginConfig.VolumeStreaming.DefaultServer.defaultValue,
    volumeStreamingDisabled: !PluginConfig.VolumeStreaming.Enabled.defaultValue,
    pdbProvider: PluginConfig.Download.DefaultPdbProvider.defaultValue,
    emdbProvider: PluginConfig.Download.DefaultEmdbProvider.defaultValue,
    saccharideCompIdMapType: 'default' as SaccharideCompIdMapType,
    volumesAndSegmentationsDefaultServer: VolsegVolumeServerConfig.DefaultServer.defaultValue,
};
type ViewerOptions = typeof DefaultViewerOptions;

export class Viewer {
    constructor(public plugin: PluginUIContext) {
    }

    static async create(elementOrId: string | HTMLElement, options: Partial<ViewerOptions> = {}) {
        const definedOptions = {} as any;
        // filter for defined properies only so the default values
        // are property applied
        for (const p of Object.keys(options) as (keyof ViewerOptions)[]) {
            if (options[p] !== void 0) definedOptions[p] = options[p];
        }

        const o: ViewerOptions = { ...DefaultViewerOptions, ...definedOptions };
        const defaultSpec = DefaultPluginUISpec();

        const spec: PluginUISpec = {
            actions: defaultSpec.actions,
            behaviors: [
                ...defaultSpec.behaviors,
                ...o.extensions.map(e => Extensions[e]),
            ],
            animations: [...defaultSpec.animations || []],
            customParamEditors: defaultSpec.customParamEditors,
            customFormats: o?.customFormats,
            layout: {
                initial: {
                    isExpanded: o.layoutIsExpanded,
                    showControls: o.layoutShowControls,
                    controlsDisplay: o.layoutControlsDisplay,
                    regionState: {
                        bottom: 'full',
                        left: o.collapseLeftPanel ? 'collapsed' : 'full',
                        right: o.collapseRightPanel ? 'hidden' : 'full',
                        top: 'full',
                    }
                },
            },
            components: {
                ...defaultSpec.components,
                controls: {
                    ...defaultSpec.components?.controls,
                    top: o.layoutShowSequence ? undefined : 'none',
                    bottom: o.layoutShowLog ? undefined : 'none',
                    left: o.layoutShowLeftPanel ? undefined : 'none',
                },
                remoteState: o.layoutShowRemoteState ? 'default' : 'none',
            },
            config: [
                [PluginConfig.General.DisableAntialiasing, o.disableAntialiasing],
                [PluginConfig.General.PixelScale, o.pixelScale],
                [PluginConfig.General.PickScale, o.pickScale],
                [PluginConfig.General.PickPadding, o.pickPadding],
                [PluginConfig.General.EnableWboit, o.enableWboit],
                [PluginConfig.General.EnableDpoit, o.enableDpoit],
                [PluginConfig.General.PreferWebGl1, o.preferWebgl1],
                [PluginConfig.General.AllowMajorPerformanceCaveat, o.allowMajorPerformanceCaveat],
                [PluginConfig.General.PowerPreference, o.powerPreference],
                [PluginConfig.Viewport.ShowExpand, o.viewportShowExpand],
                [PluginConfig.Viewport.ShowControls, o.viewportShowControls],
                [PluginConfig.Viewport.ShowSettings, o.viewportShowSettings],
                [PluginConfig.Viewport.ShowSelectionMode, o.viewportShowSelectionMode],
                [PluginConfig.Viewport.ShowAnimation, o.viewportShowAnimation],
                [PluginConfig.Viewport.ShowTrajectoryControls, o.viewportShowTrajectoryControls],
                [PluginConfig.State.DefaultServer, o.pluginStateServer],
                [PluginConfig.State.CurrentServer, o.pluginStateServer],
                [PluginConfig.VolumeStreaming.DefaultServer, o.volumeStreamingServer],
                [PluginConfig.VolumeStreaming.Enabled, !o.volumeStreamingDisabled],
                [PluginConfig.Download.DefaultPdbProvider, o.pdbProvider],
                [PluginConfig.Download.DefaultEmdbProvider, o.emdbProvider],
                [PluginConfig.Structure.SaccharideCompIdMapType, o.saccharideCompIdMapType],
                [VolsegVolumeServerConfig.DefaultServer, o.volumesAndSegmentationsDefaultServer],
            ]
        };

        const element = typeof elementOrId === 'string'
            ? document.getElementById(elementOrId)
            : elementOrId;
        if (!element) throw new Error(`Could not get element with id '${elementOrId}'`);
        const plugin = await createPluginUI(element, spec);
        return new Viewer(plugin);
    }

    loadStructureFromUrl(url: string, format: BuiltInTrajectoryFormat = 'mmcif', isBinary = false, options?: LoadStructureOptions & { label?: string }) {
        const params = DownloadStructure.createDefaultParams(this.plugin.state.data.root.obj!, this.plugin);
        return this.plugin.runTask(this.plugin.state.data.applyAction(DownloadStructure, {
            source: {
                name: 'url',
                params: {
                    url: Asset.Url(url),
                    format: format as any,
                    isBinary,
                    label: options?.label,
                    options: { ...params.source.params.options, representationParams: options?.representationParams as any },
                }
            }
        }));
    }

    async loadAllModelsOrAssemblyFromUrl(url: string, format: BuiltInTrajectoryFormat = 'mmcif', isBinary = false, options?: LoadStructureOptions) {
        const plugin = this.plugin;

        const data = await plugin.builders.data.download({ url, isBinary }, { state: { isGhost: true } });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, format);

        await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, 'all-models', { useDefaultIfSingleModel: true, representationPresetParams: options?.representationParams });
    }

    async loadStructureFromData(data: string | number[], format: BuiltInTrajectoryFormat, options?: { dataLabel?: string }) {
        const _data = await this.plugin.builders.data.rawData({ data, label: options?.dataLabel });
        const trajectory = await this.plugin.builders.structure.parseTrajectory(_data, format);
        await this.plugin.builders.structure.hierarchy.applyPreset(trajectory, 'default');
    }

    /**
     * @example
     *  viewer.loadTrajectory({
     *      model: { kind: 'model-url', url: 'villin.gro', format: 'gro' },
     *      coordinates: { kind: 'coordinates-url', url: 'villin.xtc', format: 'xtc', isBinary: true },
     *      preset: 'all-models' // or 'default'
     *  });
     */
    async loadTrajectory(params: LoadTrajectoryParams) {
        const plugin = this.plugin;

        let model: StateObjectSelector;

        if (params.model.kind === 'model-data' || params.model.kind === 'model-url') {
            const data = params.model.kind === 'model-data'
                ? await plugin.builders.data.rawData({ data: params.model.data, label: params.modelLabel })
                : await plugin.builders.data.download({ url: params.model.url, isBinary: params.model.isBinary, label: params.modelLabel });

            const trajectory = await plugin.builders.structure.parseTrajectory(data, params.model.format ?? 'mmcif');
            model = await plugin.builders.structure.createModel(trajectory);
        } else {
            const data = params.model.kind === 'topology-data'
                ? await plugin.builders.data.rawData({ data: params.model.data, label: params.modelLabel })
                : await plugin.builders.data.download({ url: params.model.url, isBinary: params.model.isBinary, label: params.modelLabel });

            const provider = plugin.dataFormats.get(params.model.format);
            model = await provider!.parse(plugin, data);
        }

        const data = params.coordinates.kind === 'coordinates-data'
            ? await plugin.builders.data.rawData({ data: params.coordinates.data, label: params.coordinatesLabel })
            : await plugin.builders.data.download({ url: params.coordinates.url, isBinary: params.coordinates.isBinary, label: params.coordinatesLabel });

        const provider = plugin.dataFormats.get(params.coordinates.format);
        const coords = await provider!.parse(plugin, data);

        const trajectory = await plugin.build().toRoot()
            .apply(TrajectoryFromModelAndCoordinates, {
                modelRef: model.ref,
                coordinatesRef: coords.ref
            }, { dependsOn: [model.ref, coords.ref] })
            .commit();

        const preset = await plugin.builders.structure.hierarchy.applyPreset(trajectory, params.preset ?? 'default');

        return { model, coords, preset };
    }

    randomColorHex(): string {
        let hex = '';
        for (let i = 0; i < 6; i++) {
          hex += Math.floor(Math.random() * 16).toString(16);
        }
        return hex;
    }

    handleResize() {
        this.plugin.layout.events.updated.next(void 0);
    }

    playAnimation(time: number){
        this.plugin.managers.animation.play(AnimateModelIndex, { duration: { name: 'fixed', params: { durationInS: time }}, mode: { name: 'once', params: { direction: 'forward' } } });
    }

    toggleRock() {
        if (!this.plugin.canvas3d) return;

        const trackball = this.plugin.canvas3d.props.trackball;
        PluginCommands.Canvas3D.SetSettings(this.plugin, {
            settings: {
                trackball: {
                    ...trackball,
                    animate: trackball.animate.name === 'rock'
                        ? { name: 'off', params: {} }
                        : { name: 'rock', params: {speed: 0.1, angle: 90}}
                }
            }
        });
        if (this.plugin.canvas3d.props.trackball.animate.name !== 'rock') {
            PluginCommands.Camera.Reset(this.plugin, {});
        }
    }

    async cameraReset() {
        await new Promise(res => requestAnimationFrame(res));
        PluginCommands.Camera.Reset(this.plugin);
    }

    async clearState(){
        const state = this.plugin.state.data;
        PluginCommands.State.RemoveObject(this.plugin, { state, ref: state.tree.root.ref });
    }
    
    toggleVisibility(li: number){
        const ref = this.plugin.managers.structure.hierarchy.current.structures[li]?.cell.sourceRef as string;
        setSubtreeVisibility(this.plugin.state.data, ref, !this.plugin.state.data.cells.get(ref)!.state.isHidden)
    }

    async loadStructure(file: string, format: BuiltInTrajectoryFormat, isBinary: boolean = false){
        const data = await this.plugin.builders.data.download({ url: Asset.Url(file), isBinary: isBinary }, { state: { isGhost: true } });
        const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);
        const model = await this.plugin.builders.structure.createModel(trajectory);
        const structure = await this.plugin.builders.structure.createStructure(model);
        return structure;
    }

    selectSequence(chain: string | number, start?: number, end?: number) {
        const atomGroups: any = {};
        if (typeof chain === 'string') {
            atomGroups['chain-test'] = MS.core.rel.eq([chain, MS.ammp('auth_asym_id')]);
          } else {
            atomGroups['chain-test'] = MS.core.rel.eq([chain, MS.ammp('id')]);}
        if (start !== undefined && end !== undefined) {
          atomGroups['residue-test'] = MS.core.rel.inRange([MS.ammp('label_seq_id'), start, end]);
        }
        return MS.struct.generator.atomGroups(atomGroups);
    }

    chainEntries() {
        const location = StructureElement.Location.create();
        const entries: LociEntry[] = [];
        this.plugin.managers.structure.selection.entries.forEach(({ selection }, ref) => {
            const cell = StateObjectRef.resolveAndCheck(this.plugin.state.data, ref);
            if (!cell || StructureElement.Loci.isEmpty(selection)) return;

            // only single polymer chain selections
            const l = StructureElement.Loci.getFirstLocation(selection, location)!;
            if (selection.elements.length > 1 || StructureProperties.entity.type(l) !== 'polymer') return;

            const stats = StructureElement.Stats.ofLoci(selection);
            const counts = structureElementStatsLabel(stats, { countsOnly: true });
            const chain = elementLabel(l, { reverse: true, granularity: 'chain' }).split('|');
            const label = `${counts} | ${chain[0]} | ${chain[chain.length - 1]}`;
            entries.push({ loci: selection, label, cell });
        });
        return entries;
    }
    
    async transform(s: StateObjectRef<PluginStateObject.Molecule.Structure>, matrix: Mat4, coordinateSystem?: SymmetryOperator) {
        const r = StateObjectRef.resolveAndCheck(this.plugin.state.data, s);
        if (!r) return;
        const o = this.plugin.state.data.selectQ(q => q.byRef(r.transform.ref).subtree().withTransformer(StateTransforms.Model.TransformStructureConformation))[0];

        const transform = coordinateSystem && !Mat4.isIdentity(coordinateSystem.matrix)
            ? Mat4.mul(Mat4(), coordinateSystem.matrix, matrix)
            : matrix;

        const params = {
            transform: {
                name: 'matrix' as const,
                params: { data: transform, transpose: false }
            }
        };
        const b = o
            ? this.plugin.state.data.build().to(o).update(params)
            : this.plugin.state.data.build().to(s)
                .insert(StateTransforms.Model.TransformStructureConformation, params, { tags: 'SuperpositionTransform' });
        await this.plugin.runTask(this.plugin.state.data.updateTree(b));
    }

    async superpose(sels: StructureSelection[]){
        let locis = [];
        for (const sel of sels){locis.push(StructureSelection.toLociWithSourceUnits(sel))};
        for (const loci of locis){this.plugin.managers.interactivity.lociSelects.select({loci: loci});}
        const pivot = this.plugin.managers.structure.hierarchy.findStructure(locis[0]?.structure);
        const coordinateSystem = pivot?.transform?.cell.obj?.data.coordinateSystem;
        const entries = this.chainEntries();
        const transforms = alignAndSuperpose(locis)
        const eA = entries[0];
        for (let i = 1, il = locis.length; i < il; ++i) {
            const eB = entries[i];
            const { bTransform, rmsd } = transforms[i - 1];
            await this.transform(eB.cell, bTransform, coordinateSystem);
            const labelA = stripTags(eA.label);
            const labelB = stripTags(eB.label);
            this.plugin.log.info(`Superposed [${labelA}] and [${labelB}] with RMSD ${rmsd.toFixed(2)}.`);
        }
        await this.cameraReset();
    }

    $(id: string) { return document.getElementById(id); }
    addControl(label: string, color: Color, action: any) {
        var labelEl = document.createElement('label');
        var inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        inputEl.checked = true;
        labelEl.appendChild(inputEl);
        labelEl.appendChild(document.createTextNode(label));
        labelEl.style.backgroundColor = Color.toStyle(color);
        inputEl.onclick = action;
        this.$('controls')!.appendChild(labelEl);
    }

    async superposing(){
        const mols = ['8dtx', '8dtt', '8dtr'];
        let color: Color[] = [];
        mols.forEach(() => {
            color.push(Color((parseInt(this.randomColorHex(), 16))))
        })

        for (let idx = 0; idx < mols.length; idx++) { this.addControl(mols[idx], color[idx], () => {this.toggleVisibility(idx);} ) }

        let structRef: Array<StateObjectSelector> = [];
        await Promise.all(mols.map(async (mol, idx) => {
            const struct = await this.loadStructure( 'http://localhost:3333/' + mol + '.pdb', 'pdb');
            structRef.push(struct);
            const polymer = await this.plugin.builders.structure.tryCreateComponentStatic(struct, 'polymer');
            await this.plugin.builders.structure.representation.addRepresentation(polymer!, {type: "cartoon", typeParams: {alpha: 0.3}, color: 'uniform', colorParams: { value: color[idx]}});
          }));
        let sels = []
        for (let li = 0; li < mols.length; li++){
            sels.push(Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
                'chain-test': Q.core.rel.eq([1, Q.ammp('id')]),
            }), this.plugin.managers.structure.hierarchy.current.structures[li]?.cell.obj?.data as Structure))
        }
        await this.superpose(sels);
        this.plugin.managers.interactivity.lociSelects.deselectAll();
        
        let h3 = this.selectSequence(1, 95, 102);
        let stem_8dtx = this.selectSequence('I');
        let stem_8dtt_8dtr = this.selectSequence('G');
        const components = {
            stem_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[0], stem_8dtx, 'stem_8dtx', {label: 'stem_8dtx'}),
            stem_8dtt: await this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[1], stem_8dtt_8dtr, 'stem_8dtt', {label: 'stem_8dtt'}),
            stem_8dtr: await this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[2], stem_8dtt_8dtr, 'stem_8dtr', {label: 'stem_8dtr'}),

            h3_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[0], h3, 'h3_8dtx', {label: 'h3_8dtx'}),
            h3_8dtt: await this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[1], h3, 'h3_8dtt', {label: 'h3_8dtt'}),
            h3_8dtr: await this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[2], h3, 'h3_8dtr', {label: 'h3_8dtr'}),
        }
        const builder = this.plugin.builders.structure.representation;
        const update = this.plugin.build();
        builder.buildRepresentation(update, components.stem_8dtx, { type: 'cartoon', color: 'uniform', colorParams: { value: Color(0x00ff00)} })
        builder.buildRepresentation(update, components.stem_8dtt, { type: 'cartoon', color: 'uniform', colorParams: { value: Color(0x00ff00)} })
        builder.buildRepresentation(update, components.stem_8dtr, { type: 'cartoon', color: 'uniform', colorParams: { value: Color(0x00ff00)} })

        builder.buildRepresentation(update, components.h3_8dtx, { type: 'cartoon', color: 'uniform', colorParams: { value: color[0]} })
        builder.buildRepresentation(update, components.h3_8dtt, { type: 'cartoon', color: 'uniform', colorParams: { value: color[1]} })
        builder.buildRepresentation(update, components.h3_8dtr, { type: 'cartoon', color: 'uniform', colorParams: { value: color[2]} })
        await update.commit();
    }
    
    async demo(){
        const time = 5;
        const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
        // const d = await this.plugin.builders.data.download({ url: Asset.Url('http://localhost:3333/7n1q.pdb'), isBinary: false }, { state: { isGhost: true } });
        // const t = await this.plugin.builders.structure.parseTrajectory(d, 'pdb');
        // const m = await this.plugin.builders.structure.createModel(t);
        // const struct = await this.plugin.builders.structure.createStructure(m);
        const struct = await this.loadStructure('http://localhost:3333/7n1q.pdb', 'pdb');
        const polymer = await this.plugin.builders.structure.tryCreateComponentStatic(struct, 'polymer');
        const repr = await this.plugin.builders.structure.representation.addRepresentation(polymer!, {type: "cartoon"});       
        const traj1 = await this.loadTrajectory({
                            model: { kind: 'model-url', url: 'http://localhost:3333/8dtx.pdb', format: 'pdb' },
                            coordinates: { kind: 'coordinates-url', url: 'http://localhost:3333/8dtx.dcd', format: 'dcd', isBinary: true },
                            preset: 'default'
                        });
        const traj2 = await this.loadTrajectory({
            model: { kind: 'model-url', url: 'http://localhost:3333/8d6z.pdb', format: 'pdb' },
            coordinates: { kind: 'coordinates-url', url: 'http://localhost:3333/8d6z.dcd', format: 'dcd', isBinary: true },
            preset: 'default'
        });

        // const d1 = this.plugin.managers.structure.hierarchy.current.structures[1]?.cell.obj?.data as Structure;
        // const sel = Script.getStructureSelection(Q => Q.struct.generator.atomGroups({
        //     'chain-test': Q.core.rel.eq(['A', Q.ammp('label_asym_id')]),
        //     'residue-test': MS.core.rel.inRange([MS.ammp('label_seq_id'), 95, 102])
        // }), d1);
        // const loci = StructureSelection.toLociWithSourceUnits(sel);
        // this.plugin.managers.structure.focus.setFromLoci(loci);
        Promise.all([repr,traj1, traj2]).then(() => { this.playAnimation(time);});
        // this.toggleRock();
        // await this.plugin.managers.animation.stop();
        await sleep((time +2)*1000);
        // this.toggleRock();
        await this.clearState();
        // const data = await this.plugin.builders.data.download({ url: Asset.Url('http://localhost:3333/7n1q.pdb'), isBinary: false }, { state: { isGhost: true } });
        // const trajectory = await this.plugin.builders.structure.parseTrajectory(data, 'pdb');
        // const model = await this.plugin.builders.structure.createModel(trajectory);
        // const structure = await this.plugin.builders.structure.createStructure(model);
        const structure = await this.loadStructure('http://localhost:3333/7n1q.pdb', 'pdb');
        const structure2 = await this.loadStructure('http://localhost:3333/8dtx.pdb', 'pdb');
        const structure3 = await this.loadStructure('http://localhost:3333/8d6z.pdb', 'pdb');
        
        // let s1 = this.plugin.managers.structure.hierarchy.current.structures[0]?.cell.obj?.data as Structure;
        let h1_8dtx = this.selectSequence('A', 26, 32);
        let h2_8dtx = this.selectSequence('A', 52, 56);
        let h3_8dtx = this.selectSequence('A', 95, 102);
        let l1_8dtx = this.selectSequence('B', 24, 34);
        let l2_8dtx = this.selectSequence('B', 50, 56);
        let l3_8dtx = this.selectSequence('B', 89 ,97);
        let peptide = MS.struct.generator.atomGroups({
            'chain-test': MS.core.rel.eq(['C', MS.ammp('auth_asym_id')]),
        });
        let peptide_8d6z = MS.struct.generator.atomGroups({
            'chain-test': MS.core.rel.eq(['H', MS.ammp('auth_asym_id')]),
        });

        const components = {
            polymer: await this.plugin.builders.structure.tryCreateComponentStatic(structure, 'polymer'),
            polymer2: await this.plugin.builders.structure.tryCreateComponentStatic(structure2, 'polymer'),
            polymer3: await this.plugin.builders.structure.tryCreateComponentStatic(structure3, 'polymer'),

            h1_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, h1_8dtx, 'h1_8dtx', {label: 'h1_8dtx'}),
            h2_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, h2_8dtx, 'h2_8dtx', {label: 'h2_8dtx'}),
            h3_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, h3_8dtx, 'h3_8dtx', {label: 'h3_8dtx'}),
            l1_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, l1_8dtx, 'l1_8dtx', {label: 'l1_8dtx'}),
            l2_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, l2_8dtx, 'l2_8dtx', {label: 'l2_8dtx'}),
            l3_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, l3_8dtx, 'l3_8dtx', {label: 'l3_8dtx'}),
            peptide_8dtx: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure2, peptide, 'peptide_8dtx', {label: 'peptide_8dtx'}),
            
            h1_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, h1_8dtx, 'h1_8d6z', {label: 'h1_8d6z'}),
            h2_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, h2_8dtx, 'h2_8d6z', {label: 'h2_8d6z'}),
            h3_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, h3_8dtx, 'h3_8d6z', {label: 'h3_8d6z'}),
            l1_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, l1_8dtx, 'l1_8d6z', {label: 'l1_8d6z'}),
            l2_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, l2_8dtx, 'l2_8d6z', {label: 'l2_8d6z'}),
            l3_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, l3_8dtx, 'l3_8d6z', {label: 'l3_8d6z'}),
            peptide_8d6z: await this.plugin.builders.structure.tryCreateComponentFromExpression(structure3, peptide_8d6z, 'peptide_8d6z', {label: 'peptide_8d6z'}),

            // ligand: await this.plugin.builders.structure.tryCreateComponentStatic(structure, 'ligand'),
            // water: await this.plugin.builders.structure.tryCreateComponentStatic(structure, 'water'),
        };

        const builder = this.plugin.builders.structure.representation;
        const update = this.plugin.build();
        if (components.polymer) builder.buildRepresentation(update, components.polymer, { type: 'gaussian-volume', color: 'uniform', colorParams: {value: Color(0x00FF00)} }, { tag: 'polymer' });
        if (components.polymer2) builder.buildRepresentation(update, components.polymer2, { type: 'gaussian-volume', color: 'uniform', colorParams: {value: Color(0x0000FF)} }, { tag: 'polymer' });
        if (components.polymer3) builder.buildRepresentation(update, components.polymer3, { type: 'gaussian-volume', color: 'uniform', colorParams: {value: Color(0x0000FF)} }, { tag: 'polymer' });
        if (components.peptide_8dtx) builder.buildRepresentation(update, components.peptide_8dtx, { type: 'cartoon', color: 'uniform', colorParams: {value: Color(0x00FF00)} });
        if (components.h1_8dtx) builder.addRepresentation(components.h1_8dtx!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0Xf77416)} });
        if (components.h2_8dtx) builder.addRepresentation(components.h2_8dtx!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0Xf77416)} });
        if (components.h3_8dtx) {
            builder.addRepresentation(components.h3_8dtx!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: "uniform", colorParams: { value: Color(0xFF0000) }});
            // builder.buildRepresentation(update, components.h3_8dtx, { type: 'gaussian-volume', controlPoints: PD.LineGraph([
            //     Vec2.create(0.19, 0.0), Vec2.create(0.2, 0.05), Vec2.create(0.25, 0.05), Vec2.create(0.26, 0.0),
            //     Vec2.create(0.79, 0.0), Vec2.create(0.8, 0.05), Vec2.create(0.85, 0.05), Vec2.create(0.86, 0.0),
            // ], { isEssential: true }), color: "uniform", colorParams: { value: Color(0xFF0000)}}, { tag: 'h3_8dtx' });
            builder.buildRepresentation(update, components.h3_8dtx, { type: 'ball-and-stick', /*color: "uniform", colorParams: {value: Color(0XFF0000)}*/ }, { tag: 'cdrh3' });
        }
        if (components.l1_8dtx) builder.addRepresentation(components.l1_8dtx!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        if (components.l2_8dtx) builder.addRepresentation(components.l2_8dtx!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        if (components.l3_8dtx) builder.addRepresentation(components.l3_8dtx!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });

        if (components.peptide_8d6z) builder.buildRepresentation(update, components.peptide_8d6z, { type: 'cartoon', color: 'uniform', colorParams: {value: Color(0x00FF00)} });
        if (components.h1_8d6z) builder.addRepresentation(components.h1_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0Xf77416)} });
        if (components.h2_8d6z) builder.addRepresentation(components.h2_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0Xf77416)} });
        if (components.h3_8d6z) {
            builder.addRepresentation(components.h3_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: "uniform", colorParams: { value: Color(0xFF0000) }});
            // builder.buildRepresentation(update, components.h3_8d6z, { type: 'gaussian-volume', controlPoints: PD.LineGraph([
            //     Vec2.create(0.19, 0.0), Vec2.create(0.2, 0.05), Vec2.create(0.25, 0.05), Vec2.create(0.26, 0.0),
            //     Vec2.create(0.79, 0.0), Vec2.create(0.8, 0.05), Vec2.create(0.85, 0.05), Vec2.create(0.86, 0.0),
            // ], { isEssential: true }), color: "uniform", colorParams: { value: Color(0xFF0000)}}, { tag: 'h3_8d6z' });
            builder.buildRepresentation(update, components.h3_8d6z, { type: 'ball-and-stick', /*color: "uniform", colorParams: {value: Color(0XFF0000)}*/ }, { tag: 'cdrh3' });
        }
        if (components.l1_8d6z) builder.addRepresentation(components.l1_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        if (components.l2_8d6z) builder.addRepresentation(components.l2_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        if (components.l3_8d6z) builder.addRepresentation(components.l3_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });

        // if (components.ligand) builder.buildRepresentation(update, components.ligand, { type: 'ball-and-stick' }, { tag: 'ligand' });
        // if (components.water) builder.buildRepresentation(update, components.water, { type: 'ball-and-stick', typeParams: { alpha: 0.6 } }, { tag: 'water' });
        await update.commit();

        // this.plugin.behaviors.interaction.click.subscribe((event) => {
        //     if (StructureElement.Loci.is(event.current.loci)) {
        
        //         const loc = StructureElement.Location.create();
        //         StructureElement.Loci.getFirstLocation(event.current.loci, loc);
        
        //         console.log(StructureProperties.residue.auth_seq_id(loc));
        //     }
        // });
    }
}

export interface LoadStructureOptions {
    representationParams?: StructureRepresentationPresetProvider.CommonParams
}

export interface VolumeIsovalueInfo {
    type: 'absolute' | 'relative',
    value: number,
    color: Color,
    alpha?: number,
    volumeIndex?: number
}

export interface LoadTrajectoryParams {
    model: { kind: 'model-url', url: string, format?: BuiltInTrajectoryFormat /* mmcif */, isBinary?: boolean }
    | { kind: 'model-data', data: string | number[] | ArrayBuffer | Uint8Array, format?: BuiltInTrajectoryFormat /* mmcif */ }
    | { kind: 'topology-url', url: string, format: BuiltInTopologyFormat, isBinary?: boolean }
    | { kind: 'topology-data', data: string | number[] | ArrayBuffer | Uint8Array, format: BuiltInTopologyFormat },
    modelLabel?: string,
    coordinates: { kind: 'coordinates-url', url: string, format: BuiltInCoordinatesFormat, isBinary?: boolean }
    | { kind: 'coordinates-data', data: string | number[] | ArrayBuffer | Uint8Array, format: BuiltInCoordinatesFormat },
    coordinatesLabel?: string,
    preset?: keyof PresetTrajectoryHierarchy
}
