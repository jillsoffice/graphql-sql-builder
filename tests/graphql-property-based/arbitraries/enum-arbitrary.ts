import fc from 'fast-check';
import {
    DocumentNode,
    EnumTypeDefinitionNode,
    EnumValueDefinitionNode
} from 'graphql';
import { getEnumTypeDefinitionNode } from '../../../utilities';

export function enumArbitrary(
    documentNode: Readonly<DocumentNode>,
    enumName: string
): fc.Arbitrary<string> {
    const enumTypeDefinitionNode: Readonly<EnumTypeDefinitionNode> | 'NOT_FOUND' = getEnumTypeDefinitionNode(documentNode, enumName);

    if (enumTypeDefinitionNode === 'NOT_FOUND') {
        throw new Error(`enum ${enumName} was not found in the schema`);
    }

    const enumValueNames: ReadonlyArray<string> = enumTypeDefinitionNode.values?.map((enumValueDefinitionNode: Readonly<EnumValueDefinitionNode>) => {
        return enumValueDefinitionNode.name.value;
    }) || [];

    return fc.constantFrom(...enumValueNames);
}