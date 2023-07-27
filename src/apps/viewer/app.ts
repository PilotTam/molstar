/**
 * Copyright (c) 2018-2023 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author David Sehnal <david.sehnal@gmail.com>
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 */

import { G3DFormat, G3dProvider } from '../../extensions/g3d/format';
import { VolsegVolumeServerConfig } from '../../extensions/volumes-and-segmentations';
import { DownloadStructure } from '../../mol-plugin-state/actions/structure';
import { PresetTrajectoryHierarchy } from '../../mol-plugin-state/builder/structure/hierarchy-preset';
import { StructureRepresentationPresetProvider } from '../../mol-plugin-state/builder/structure/representation-preset';
import { DataFormatProvider } from '../../mol-plugin-state/formats/provider';
import { BuiltInTopologyFormat } from '../../mol-plugin-state/formats/topology';
import { BuiltInCoordinatesFormat } from '../../mol-plugin-state/formats/coordinates';
import { BuiltInTrajectoryFormat } from '../../mol-plugin-state/formats/trajectory';
import { TrajectoryFromModelAndCoordinates } from '../../mol-plugin-state/transforms/model';
import { createPluginUI } from '../../mol-plugin-ui/react18';
import { PluginUIContext } from '../../mol-plugin-ui/context';
import { DefaultPluginUISpec, PluginUISpec } from '../../mol-plugin-ui/spec';
import { PluginCommands } from '../../mol-plugin/commands';
import { PluginConfig } from '../../mol-plugin/config';
import { PluginLayoutControlsDisplay } from '../../mol-plugin/layout';
import { StateObjectRef, StateObjectSelector, StateSelection } from '../../mol-state';
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
import { Structure, StructureElement, StructureProperties, Unit } from '../../mol-model/structure';
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
import { colors } from './palindromic_theme';
import { OrderedSet } from '../../mol-data/int/ordered-set';
import { StructureFocusRepresentation } from '../../mol-plugin/behavior/dynamic/selection/structure-focus-representation';
import { Expression } from '../../mol-script/language/expression';
import { StructureComponentRef } from '../../mol-plugin-state/manager/structure/hierarchy-state';
import { Loci } from '../../mol-model/loci';

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

interface FastaSeq {
    h: number,
    seq: string
}

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

    // return structure's state reference for data/view management (e.g. focus, selection)
    async loadStructure(file: string, format: BuiltInTrajectoryFormat, isBinary: boolean = false){
        const data = await this.plugin.builders.data.download({ url: Asset.Url(file), isBinary: isBinary }, { state: { isGhost: true } });
        const trajectory = await this.plugin.builders.structure.parseTrajectory(data, format);
        const model = await this.plugin.builders.structure.createModel(trajectory);
        const structure = await this.plugin.builders.structure.createStructure(model);
        return structure;
    }

    handleResize() {
        this.plugin.layout.events.updated.next(void 0);
    }

    playAnimation(time: number){
        this.plugin.managers.animation.play(AnimateModelIndex, { duration: { name: 'fixed', params: { durationInS: time }}, mode: { name: 'once', params: { direction: 'forward' } } });
    }

    // spin is similar, change 'rock' to 'spin' and params only has :speed
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

    async clearState(ref?: string){
        const state = this.plugin.state.data;
        if (!ref) ref = state.tree.root.ref;
        PluginCommands.State.RemoveObject(this.plugin, { state, ref: ref });
    }
    
    // hide/show the whole structure
    toggleVisibility(li: number){
        const ref = this.plugin.managers.structure.hierarchy.current.structures[li]?.cell.sourceRef as string;
        setSubtreeVisibility(this.plugin.state.data, ref, !this.plugin.state.data.cells.get(ref)!.state.isHidden)
    }

    selectSequenceRange(chain: string | number, start?: number, end?: number) {
        const atomGroups: any = {};
        if (typeof chain === 'string') {
            atomGroups['chain-test'] = MS.core.rel.eq([chain, MS.ammp('auth_asym_id')]);
          } else {
            atomGroups['chain-test'] = MS.core.rel.eq([chain, MS.ammp('id')]);}
        if (start !== -1) {
          atomGroups['residue-test'] = MS.core.rel.inRange([MS.ammp('label_seq_id'), start, end]);
        }
        return MS.struct.generator.atomGroups(atomGroups);
    }

    selectSequenceSet(chain: string | number, set?: number[]) {
        const atomGroups: any = {};
        if (typeof chain === 'string') {
            atomGroups['chain-test'] = MS.core.rel.eq([chain, MS.ammp('auth_asym_id')]);
          } else {
            atomGroups['chain-test'] = MS.core.rel.eq([chain, MS.ammp('id')]);}
        if (set) {
          atomGroups['residue-test'] = MS.core.set.has([MS.set(...set), MS.ammp('auth_seq_id')]);
        }
        return MS.struct.generator.atomGroups(atomGroups);
    }

    async LociFromStructureSelection(mols: number, chainId: string | number, set?: number[]): Promise<StructureElement.Loci[]>{
        let sels = []
        for (let li = 0; li < mols; li++){
            sels.push(Script.getStructureSelection(this.selectSequenceSet(chainId, set), this.plugin.managers.structure.hierarchy.current.structures[li]?.cell.obj?.data as Structure))
        }
        return sels.map((sel) => {return StructureSelection.toLociWithSourceUnits(sel);})
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

    async superpose(locis: StructureElement.Loci[]){
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
    addControl(label: string, action: any, color?: Color, checked: boolean = false, id?: string) {
        var labelEl = document.createElement('label');
        var inputEl = document.createElement('input');
        inputEl.type = 'checkbox';
        if (id) inputEl.id = id;
        inputEl.checked = checked;
        labelEl.appendChild(inputEl);
        labelEl.appendChild(document.createTextNode(label));
        if (color) labelEl.style.backgroundColor = Color.toStyle(color);
        inputEl.onclick = action;
        this.$('controls')!.appendChild(labelEl);
    }

    async focus(locis: StructureElement.Loci[]){
        const addPromises = locis.map((loci) => {
            return new Promise<void>((resolve) => {
            this.plugin.managers.structure.focus.addFromLoci(loci);
            resolve();
            });
        });
        await Promise.all(addPromises);
    }

    async updateFocusRepr(epitope_id: number) {
        const state = this.plugin.state.data, tree = state.tree;
        const build = state.build();
        await this.plugin.dataTransaction(async () => {
            this.plugin.managers.structure.hierarchy.current.structures.forEach(async (s, i) => {  
                const refs = StateSelection.findUniqueTagsInSubtree(tree, s.cell.transform.ref, new Set(["structure-focus-surr-repr", "structure-focus-target-repr"]));   
                build.to(refs["structure-focus-surr-repr"]!).update(StateTransforms.Representation.StructureRepresentation3D, old => {old.colorTheme.params.idx = i; old.colorTheme.params.epitope_id = epitope_id});
                build.to(refs["structure-focus-target-repr"]!).update(StateTransforms.Representation.StructureRepresentation3D, old => {old.colorTheme.params.idx = i; old.colorTheme.params.epitope_id = epitope_id});
            })
        });
        build.commit();
    }

    async toggleSurr(mols: number, antigen: number){
        this.plugin.state.updateBehavior(StructureFocusRepresentation, p => {
            if (p.expandRadius == 0) p.expandRadius = 5;
            else p.expandRadius = 0;
        })
        // updateBehavior above will update all the focus representation, resetting palindromic color theme indexing
        // need to re-update focus representations for each structure
        // ***BUG: unexpected target focus remains after toggle, probably due to wrong async await pattern
        let locis = await this.LociFromStructureSelection(mols, 1)
        await this.focus(locis);
        await this.updateFocusRepr(antigen);
        this.plugin.managers.interactivity.lociSelects.deselectAll();
        this.plugin.managers.structure.focus.clear();
    }

    // remove loci from display, but still appears if show surroundings when focus is set to true
    // consider using it for animation of mutating prediction models
    subtract(loci: Loci[]){
        loci.forEach(l => this.plugin.managers.structure.selection.fromLoci('add', l));
        const sel = this.plugin.managers.structure.hierarchy.getStructuresWithSelection();
        const components: StructureComponentRef[] = [];
        for (const s of sel) components.push(...s.components);
        if (components.length === 0) return;
        this.plugin.managers.structure.component.modifyByCurrentSelection(components, 'subtract');
    }
    
    // subscribe click behavior to viewer, when an atom/residue is clicked, console print out its sequence id and component id
    // can change this to some other interactive features if needed in the future
    LociDebugger(){
        return this.plugin.behaviors.interaction.click.subscribe((event) => {
            const atomInfo: { id: number, labelCompId: string, authSeqId: number, authAsymId: string }[] = [];
            const loci = event.current.loci;
            if (StructureElement.Loci.is(loci)) {
                const l = StructureElement.Location.create(loci.structure);
                for (const e of loci.elements) {
                    if (Unit.isAtomic(e.unit)) {
                        l.unit = e.unit;
                        OrderedSet.forEach(e.indices, v => {
                            console.log(v)
                            l.element = e.unit.elements[v];
                            atomInfo.push({
                                id: StructureProperties.atom.id(l),
                                labelCompId: StructureProperties.atom.label_comp_id(l),
                                authSeqId: StructureProperties.residue.auth_seq_id(l),
                                authAsymId: StructureProperties.chain.auth_asym_id(l),
                            });
                        });
                    }
                }
            }
            console.log(atomInfo);
        });
    }

    // parse igfold fasta file results, h: H chain seqeunce length, for identificaition in chain selection when creating components
    async getFasta(path: string, len: number): Promise<FastaSeq[]> {
        let list: FastaSeq[] = [];
        for (let i = 0; i < len; i++){
            await fetch(path + 'pred' + i + '.fasta')
            .then(response => response.text())
            .then(string => {
                const newString = string.replace(/\n/g, '');
                const hLength = newString.indexOf(">:L") - 3
                const hlChain = newString.replace(/>:L|>:H/g, '');
                list.push({h: hLength, seq: hlChain});
            })
        }
        return list;
    }

    // for superposing structures comparsions
    mutatedPos(a: string, b: string[]): {[key: number]: number;} {
        let pos = new Set<number>();
        for (let i = 0; i < a.length; i++){
            for (let j = 0; j < b.length; j++){
                if (a[i] != b[j][i]) pos.add(i+1);
            }
        }
        const sortPos = Array.from(pos).sort((a, b) => a - b);
        const range: { [key: number]: number } = {};
        let start = sortPos[0];
        let end = start;
        
        //group continuous residues together as one component to prevent creating too many of them
        for (let i = 1; i < sortPos.length; i++) {
          if (sortPos[i] === end + 1) {
            end = sortPos[i];
          } else {
            range[start] = end;
            start = sortPos[i];
            end = start;
          }
        }
      
        range[start] = end;
        return range;
    }

    //for superposing, whenever a structure is clicked (to hide or show), recreate components dynamcially based on difference in sequneces for the checked strutures
    async updateRepr(seqs: FastaSeq[], structRef: Array<StateObjectSelector>, mols: string[], antigenChain: number, compo: Array<StateObjectSelector<any, any>> | undefined): Promise<Array<StateObjectSelector<any, any>> | undefined>{
        if (compo) {
            //clear current components
            await new Promise((resolve) => {
                const update = this.plugin.build();
                compo.forEach((ref:any) => update.delete(ref));
                update.commit();
                resolve(void 0);
            });
        }
        let checked = [];
        for (let i = 0; i < mols.length; i++){ if ((this.$(mols[i]+'_visibility') as HTMLInputElement).checked){ checked.push(i); }};
        if (checked.length === 0) return;
        let compareSeqs = [];
        for (let i = 1; i < checked.length; i++){
            compareSeqs.push(seqs[checked[i]].seq);
        }
        const mutatedPos = this.mutatedPos(seqs[checked[0]].seq, compareSeqs);
        let selections = [];
        for (const start in mutatedPos) {
            let chain:string;
            if (parseInt(start, 10) > seqs[0].h) chain = "L";
            else chain = "H";
            for (let i = 0; i < checked.length; i++){
                selections.push({id: checked[i], key: 'm'+start, chainId: chain, start: parseInt(start, 10), end: mutatedPos[start]});
            }
        }
        const expressions: {[x: string]: Expression} = {};
        for (const sel of selections){
           expressions[sel.id +  "_" + sel.key] = this.selectSequenceRange(sel.chainId, sel.start, sel.end);
        }
        const components: {[x: string]: StateObjectSelector<any, any>} = {};
        const promises: Promise<any>[] = [];
        for (const key in expressions) {
          const promise = this.plugin.builders.structure.tryCreateComponentFromExpression(structRef[parseInt(key.split('_')[0], 10)], expressions[key], key, {label: key});
          promises.push(promise);
          promise.then(component => {
            if (component) components[key] = component;
          });
        }
        await Promise.all(promises);
        const builder = this.plugin.builders.structure.representation;
        const update = this.plugin.build();
        for (const key in components) {
            if (key[2] == 'm') {
                builder.buildRepresentation(update, components[key], {type: "ball-and-stick", color: "palindromic-custom", colorParams: {idx: parseInt(key.split('_')[0], 10)}});
                // builder.buildRepresentation(update, components[key], {type: InteractionsRepresentationProvider, typeParams: { includeParent: true, parentDisplay: 'between', visuals: ["inter-unit"] }, color: InteractionTypeColorThemeProvider }); 
            }
            else builder.buildRepresentation(update, components[key], {type: 'cartoon',  color: 'palindromic-custom', colorParams: {idx: parseInt(key.split('_')[0], 10), epitope_id: antigenChain }})
        }
        await update.commit();
        return Object.values(components);
    }

    //superposition viewer for services using igfold
    async igfold(dir: string, loop: string, anti: string){
        // this.LociDebugger(); //to understand what data you can get from loci, further development can be made using this function for user click behaviors (e.g. create component on selected residue)
        const path = dir;
        const antigenChain = parseInt(anti, 10);
        let mols: string[]= [];
        for (let i = 0; i < parseInt(loop, 10); i++){
            mols.push("pred" + i);
        }
        
        const seqs = await this.getFasta(path, mols.length);
        this.plugin.state.updateBehavior(StructureFocusRepresentation, p => { p.expandRadius = 0;})

        let structRef: Array<StateObjectSelector> = [];
        await Promise.all(mols.map(async (mol, idx) => {
            const struct = await this.loadStructure(path + mol + '.pdb', 'pdb');
            structRef.push(struct);
            const polymer = await this.plugin.builders.structure.tryCreateComponentStatic(struct, 'polymer');
            await this.plugin.builders.structure.representation.addRepresentation(polymer!, {type: "cartoon", typeParams: {alpha: 0.3}, color: 'palindromic-custom', colorParams: { idx:idx }});
        }));

        let components: Array<StateObjectSelector<any, any>> | undefined = [];

        // may consider change the molstar control panel which use React framework in the future
        this.addControl("Show Surroundings", () => {this.toggleSurr(mols.length, antigenChain);}, undefined, false);
        for (let idx = 0; idx < mols.length; idx++) { this.addControl(mols[idx], async() => {this.toggleVisibility(idx); components = await this.updateRepr(seqs, structRef, mols, antigenChain, components);}, Color(colors[idx]), false, mols[idx]+'_visibility' ) };
        let checkbox = this.$(mols[0]+'_visibility') as HTMLInputElement;
        checkbox.checked = true;
        checkbox = this.$(mols[mols.length-1]+'_visibility') as HTMLInputElement;
        checkbox.checked = true;

        let locis = await this.LociFromStructureSelection(mols.length, 1)
        await this.superpose(locis);
        await this.focus(locis);
        this.plugin.managers.interactivity.lociSelects.deselectAll();

        components = await this.updateRepr(seqs, structRef, mols, antigenChain, components);

        locis = await this.LociFromStructureSelection(mols.length, "L");
        this.subtract(locis);

        for (let li = 1; li < mols.length-1; li++){
            this.toggleVisibility(li);
        }

        await this.updateFocusRepr(antigenChain);
        this.plugin.managers.structure.focus.clear();
    }

    //function arguments may need to changed into array of filename? or some hashmap that tells have dcd files or not
    async animation(mol: string){
        this.plugin.clear();
        const time = 5;
        // const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))
        //     await sleep((time +2)*1000);
        const struct = await this.loadStructure('http://localhost:3333/7n1q.pdb', 'pdb');
        const polymer = await this.plugin.builders.structure.tryCreateComponentStatic(struct, 'polymer');
        const repr = await this.plugin.builders.structure.representation.addRepresentation(polymer!, {type: "cartoon"});       
        const traj1 = await this.loadTrajectory({
                            model: { kind: 'model-url', url: 'http://localhost:3333/8dtx_moved.pdb', format: 'pdb' },
                            coordinates: { kind: 'coordinates-url', url: 'http://localhost:3333/8dtx.dcd', format: 'dcd', isBinary: true },
                            preset: 'default'
                        });
        const traj2 = await this.loadTrajectory({
            model: { kind: 'model-url', url: 'http://localhost:3333/8d6z.pdb', format: 'pdb' },
            coordinates: { kind: 'coordinates-url', url: 'http://localhost:3333/8d6z.dcd', format: 'dcd', isBinary: true },
            preset: 'default'
        });
        Promise.all([repr,traj1, traj2]).then(() => { this.playAnimation(time);});
    }

    // a hardcoded demo for highlighting cdr regions and epitope of antigen
    // need refactor when the json input from repdiction model is finalised
    // note that unique key is needed for creating each component
    async demo(){
        const structure = await this.loadStructure('http://localhost:3333/7n1q.pdb', 'pdb');
        const structure2 = await this.loadStructure('http://localhost:3333/8dtx_moved.pdb', 'pdb');
        const structure3 = await this.loadStructure('http://localhost:3333/8d6z.pdb', 'pdb');
        
        let h1_8dtx = this.selectSequenceRange('A', 26, 32);
        let h2_8dtx = this.selectSequenceRange('A', 52, 56);
        let h3_8dtx = this.selectSequenceRange('A', 95, 102);
        let l1_8dtx = this.selectSequenceRange('B', 24, 34);
        let l2_8dtx = this.selectSequenceRange('B', 50, 56);
        let l3_8dtx = this.selectSequenceRange('B', 89 ,97);
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
            builder.buildRepresentation(update, components.h3_8d6z, { type: 'ball-and-stick', /*color: "uniform", colorParams: {value: Color(0XFF0000)}*/ }, { tag: 'cdrh3' });
        }
        if (components.l1_8d6z) builder.addRepresentation(components.l1_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        if (components.l2_8d6z) builder.addRepresentation(components.l2_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        if (components.l3_8d6z) builder.addRepresentation(components.l3_8d6z!, { type: 'molecular-surface', typeParams: { alpha: 0.5 }, color: 'uniform', colorParams: {value: Color(0X5442f5)} });
        await update.commit();
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
