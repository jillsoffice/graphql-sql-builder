// @ts-nocheck

import {
    parse,
    DocumentNode,
    ScalarTypeDefinitionNode,
    DirectiveDefinitionNode,
    DefinitionNode,
    DirectiveNode,
    FieldDefinitionNode,
    EnumTypeDefinitionNode,
    EnumValueDefinitionNode,
    InputObjectTypeDefinitionNode,
    ObjectTypeDefinitionNode,
    InputValueDefinitionNode,
    isEnumType,
    isListType,
    isScalarType,
    isNonNullType,
    NonNullTypeNode,
} from 'graphql';

export function getFieldDefinitionType(node: Readonly<FieldDefinitionNode> | any): string {
    if (node.type) {
        return getFieldDefinitionType(node.type);
    }

    return node.name.value;
}

export function generateQueryName(
    queryType: Readonly<QueryType>, 
    tableName: Readonly<JOTableName>
): string {
    const requestTypePrefix: string = queryType.toLowerCase();
    const requestTypeSuffix: string = convertTableNameToTypeDefName(tableName);
    return `${requestTypePrefix}${requestTypeSuffix}`;
}

