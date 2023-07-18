/**
 * Copyright (c) 2019 mol* contributors, licensed under MIT, See LICENSE file for more info.
 *
 * @author Alexander Rose <alexander.rose@weirdbyte.de>
 * @author David Sehnal <david.sehnal@gmail.com>
 */


import { StructureElement, Bond, StructureProperties, Unit } from '../../mol-model/structure';

import { Color } from '../../mol-util/color';
import { Location } from '../../mol-model/location';
import { ColorTheme, LocationColor } from '../../mol-theme/color';
import { ParamDefinition as PD } from '../../mol-util/param-definition';
import { ThemeDataContext } from '../../mol-theme/theme';
import { Column } from '../../mol-data/db';

const Description = 'Gives every chain a color from a list based on its `asym_id` value.';
export const colors = [0xd33115, 0xfcc400, 0x009ce0, 0x7d2187, 0xe4a096, 0xe4e496, 0x96e4e0, 0xb096e4, 0x24876e, 0x872453];
const PalindromicCustomColorThemeParams = {
    colors: PD.ObjectList({ color: PD.Color(Color(0xffffff)) }, ({ color }) => Color.toHexString(color),
        { defaultValue: colors.map(c => ({ color: Color(c) })) }),
    idx: PD.Numeric(0, {min: 0, max: 3}),
    isEpitope: PD.Boolean(false),
    epitope_id: PD.Numeric(-1)
};
type PalindromicCustomColorThemeParams = typeof PalindromicCustomColorThemeParams
function getChainIdColorThemeParams(ctx: ThemeDataContext) {
    return PalindromicCustomColorThemeParams; // TODO return copy
}

function getAsymId(unit: Unit): StructureElement.Property<string> {
    switch (unit.kind) {
        case Unit.Kind.Atomic:
            return StructureProperties.chain.label_asym_id;
        case Unit.Kind.Spheres:
        case Unit.Kind.Gaussians:
            return StructureProperties.coarse.asym_id;
    }
}

function addAsymIds(map: Map<string, number>, data: Column<string>) {
    let j = map.size;
    for (let o = 0, ol = data.rowCount; o < ol; ++o) {
        const k = data.value(o);
        if (!map.has(k)) {
            map.set(k, j);
            j += 1;
        }
    }
}

function PalindromicCustomColorTheme(ctx: ThemeDataContext, props: PD.Values<PalindromicCustomColorThemeParams>): ColorTheme<PalindromicCustomColorThemeParams> {
    let color: LocationColor;

    const colors = props.colors, idx = props.idx, isEpitope = props.isEpitope, epitope_id = props.epitope_id, defaultColor = colors[0].color;

    if (ctx.structure) {
        const l = StructureElement.Location.create(ctx.structure);
        const { models } = ctx.structure;
        const asymIdSerialMap = new Map<string, number>();
        for (let i = 0, il = models.length; i < il; ++i) {
            const m = models[i];
            addAsymIds(asymIdSerialMap, m.atomicHierarchy.chains.label_asym_id);
            if (m.coarseHierarchy.isDefined) {
                addAsymIds(asymIdSerialMap, m.coarseHierarchy.spheres.asym_id);
                addAsymIds(asymIdSerialMap, m.coarseHierarchy.gaussians.asym_id);
            }
        }

        color = (location: Location): Color => {
            const len = colors.length;
            if (StructureElement.Location.is(location)) {
                if (isEpitope) return Color(0x00ff00);
                const asym_id = getAsymId(location.unit);
                const o = asymIdSerialMap.get(asym_id(location)) || 0;
                if (o === epitope_id) return Color(0x00ff00);
                return colors[idx % len].color;
            } else if (Bond.isLocation(location)) {
                if (isEpitope) return Color(0x00ff00);
                const asym_id = getAsymId(location.aUnit);
                l.unit = location.aUnit;
                l.element = location.aUnit.elements[location.aIndex];
                const o = asymIdSerialMap.get(asym_id(l)) || 0;
                if (o === epitope_id) return Color(0x00ff00);
                return colors[idx % len].color;
            }
            return defaultColor;
        };
    } else {
        color = () => defaultColor;
    }

    return {
        factory: PalindromicCustomColorTheme,
        granularity: 'group',
        color,
        props,
        description: Description,
        legend: undefined
    };
}

export const CustomPalindromicThemeProvider: ColorTheme.Provider<PalindromicCustomColorThemeParams, 'palindromic-custom'> = {
    name: 'palindromic-custom',
    label: 'Palindromic Custom',
    category: 'Custom',
    factory: PalindromicCustomColorTheme,
    getParams: getChainIdColorThemeParams,
    defaultValues: PD.getDefaultValues(PalindromicCustomColorThemeParams),
    isApplicable: (ctx: ThemeDataContext) => !!ctx.structure
};