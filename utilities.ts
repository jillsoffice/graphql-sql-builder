import {
    DefinitionNode,
    ObjectTypeDefinitionNode,
    FieldDefinitionNode,
    DocumentNode,
    ArgumentNode,
    DirectiveNode,
    TypeNode,
    parse,
    OperationDefinitionNode,
    FieldNode,
    StringValueNode,
    BooleanValueNode,
    EnumTypeDefinitionNode
} from 'graphql';
import {
    JOObjectTypeName,
    NestedOperationName
} from './types.d';

export function getModelObjectTypeDefinitionNodes(
    definitions: ReadonlyArray<DefinitionNode>
): ReadonlyArray<ObjectTypeDefinitionNode> {
    return definitions.filter((definitionNode: Readonly<DefinitionNode>): definitionNode is Readonly<ObjectTypeDefinitionNode> => {
        if (
            definitionNode.kind === 'ObjectTypeDefinition' &&
            containsModelDirective(definitionNode.directives)
        ) {
            return true;
        }
        else {
            return false;
        }
    });
}

function containsModelDirective(directives: ReadonlyArray<DirectiveNode> | undefined): boolean {
    if (
        directives === undefined ||
        directives.length === 0
    ) {
        return false;
    }

    const directiveNames: ReadonlyArray<string> = directives.map((directive: Readonly<DirectiveNode>) => directive.name.value);

    if (directiveNames.includes('model')) {
        return true;
    }
    else {
        return false;
    }
}

export function isFieldDefinitionNodeAnEnum(
    documentNode: Readonly<DocumentNode>,
    fieldDefinitionNode: Readonly<FieldDefinitionNode>
): boolean {
    const typeName: string = getTypeNameFromTypeNode(fieldDefinitionNode.type);
    return getEnumTypeDefinitionNode(
        documentNode,
        typeName
    ) !== 'NOT_FOUND';
}

export function isTypeNameARelation(
    documentNode: Readonly<DocumentNode>,
    typeName: string
): boolean {
    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(documentNode.definitions);
    return modelObjectTypeDefinitionNodes.some((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        if (objectTypeDefinitionNode.name.value === typeName) {
            return true;
        }
        else {
            return false;
        }
    });
}

export function getNonIgnoredFieldDefinitionNodes(fieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode>) {
    return fieldDefinitionNodes.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        const dbDirectiveNode: Readonly<DirectiveNode> | undefined = fieldDefinitionNode.directives?.find((directiveNode: Readonly<DirectiveNode>) => directiveNode.name.value === 'db');            
        const ignoreArgumentNode: Readonly<ArgumentNode> | undefined = dbDirectiveNode?.arguments?.find((argumentNode: Readonly<ArgumentNode>) => argumentNode.name.value === 'ignore');
        const ignore: boolean = ignoreArgumentNode?.value.kind === 'BooleanValue' ? ignoreArgumentNode.value.value : false;

        if (ignore === true) {
            return false;
        }
        else {
            return true;
        }
    });
}

export function getObjectTypeDefinitionNodeForTypeName(
    documentNode: Readonly<DocumentNode>,
    typeName: JOObjectTypeName
): Readonly<ObjectTypeDefinitionNode> {
    return documentNode.definitions.find((definitionNode: Readonly<DefinitionNode>) => {
        if (
            definitionNode.kind === 'ObjectTypeDefinition' &&
            definitionNode.name.value === typeName
        ) {
            return true;
        }
        else {
            return false;
        }
    }) as Readonly<ObjectTypeDefinitionNode>;
}

// TODO redo this recursively
export function getScalarFieldNamesForObjectType(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>
): Array<string> {
    return objectTypeDefinitionNode.fields?.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        
        if (fieldDefinitionNode.type.kind === 'ListType') {
            // TODO for now we are assuming that all list types are relations
            // TODO doing this recursively should fix the list type infinite issue
            return false;
        }

        if (fieldDefinitionNode.type.kind === 'NamedType') {
            return !isTypeNameARelation(documentNode, fieldDefinitionNode.type.name.value);
        }

        if (fieldDefinitionNode.type.kind === 'NonNullType') {
            if (fieldDefinitionNode.type.type.kind === 'ListType') {
                // TODO for now we are assuming that all list types are relations
                // TODO doing this recursively should fix the list type infinite issue
                return false;
            }

            if (fieldDefinitionNode.type.type.kind === 'NamedType') {
                return !isTypeNameARelation(documentNode, fieldDefinitionNode.type.type.name.value);
            }
        }
    }).map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        return fieldDefinitionNode.name.value;
    }) || [];
}

// TODO redo this recursively
// TODO combine with above function
export function getRelationFieldNamesForObjectType(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>
): Array<JOObjectTypeName> {
    return objectTypeDefinitionNode.fields?.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        
        if (fieldDefinitionNode.type.kind === 'ListType') {
            // TODO for now we are assuming that all list types are relations
            // TODO doing this recursively should fix the list type infinite issue
            return true;
        }

        if (fieldDefinitionNode.type.kind === 'NamedType') {
            return isTypeNameARelation(documentNode, fieldDefinitionNode.type.name.value);
        }

        if (fieldDefinitionNode.type.kind === 'NonNullType') {
            if (fieldDefinitionNode.type.type.kind === 'ListType') {
                // TODO for now we are assuming that all list types are relations
                // TODO doing this recursively should fix the list type infinite issue
                return true;
            }

            if (fieldDefinitionNode.type.type.kind === 'NamedType') {
                return isTypeNameARelation(documentNode, fieldDefinitionNode.type.type.name.value);
            }
        }
    }).map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        return fieldDefinitionNode.name.value as JOObjectTypeName;
    }) || [];
}

export function addFieldDefinitionNodesToObjectTypeDefinition(
    definitionNodes: ReadonlyArray<DefinitionNode>,
    name: string,
    fieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode>
) {
    return definitionNodes.map((definitionNode: Readonly<DefinitionNode>) => {
        if (
            definitionNode.kind === 'ObjectTypeDefinition' &&
            definitionNode.name.value === name
        ) {
            return {
                ...definitionNode,
                fields: [
                    ...(definitionNode.fields === undefined ? [] : definitionNode.fields),
                    ...fieldDefinitionNodes
                ]
            };
        }
        else {
            return definitionNode;
        }
    });
}

export function isListTypeNode(typeNode: Readonly<TypeNode>): boolean {
    if (typeNode.kind === 'ListType') {
        return true;
    }

    if (typeNode.kind === 'NonNullType') {
        return isListTypeNode(typeNode.type);
    }

    return false;
}

export function getTypeNameFromTypeNode(typeNode: Readonly<TypeNode>): string {
    if (typeNode.kind === 'NonNullType') {
        return getTypeNameFromTypeNode(typeNode.type);
    }

    if (typeNode.kind === 'ListType') {
        return getTypeNameFromTypeNode(typeNode.type);
    }

    if (typeNode.kind === 'NamedType') {
        return typeNode.name.value;
    }

    throw new Error(`getTypeNameFromTypeNode: this should not happen`);
}

export function getObjectTypeNameFromGQLFieldName(
    documentNode: Readonly<DocumentNode>,
    objectTypeName: JOObjectTypeName,
    gqlFieldName: string
): JOObjectTypeName | 'NOT_FOUND' {
    const objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodeForTypeName(
        documentNode,
        objectTypeName
    );

    const fieldDefinitionNode: Readonly<FieldDefinitionNode> | undefined = objectTypeDefinitionNode.fields?.find((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        return fieldDefinitionNode.name.value === gqlFieldName;
    });

    if (fieldDefinitionNode === undefined) {
        return 'NOT_FOUND';
    }

    const isRelation: boolean = isFieldDefinitionNodeARelation(documentNode, fieldDefinitionNode);
    
    if (isRelation === false) {
        return 'NOT_FOUND';
    }

    return getObjectTypeNameFromFieldDefinitionNode(
        documentNode,
        fieldDefinitionNode
    );
}

export function getObjectTypeNameFromFieldDefinitionNode(
    documentNode: Readonly<DocumentNode>,
    fieldDefinitionNode: Readonly<FieldDefinitionNode>
): JOObjectTypeName | 'NOT_FOUND' {
    const isRelation: boolean = isFieldDefinitionNodeARelation(documentNode, fieldDefinitionNode);
    
    if (isRelation === false) {
        return 'NOT_FOUND';
    }

    return getTypeNameFromTypeNode(fieldDefinitionNode.type) as JOObjectTypeName;
}

export function getObjectTypeNameFromQuery(queryText: string): JOObjectTypeName | 'NOT_FOUND' {
    const documentNode: Readonly<DocumentNode> = parse(queryText);

    const operationDefinition: OperationDefinitionNode = documentNode.definitions[0] as OperationDefinitionNode;

    const firstSelectionSet = operationDefinition.selectionSet.selections[0] as FieldNode;

    const queryName: string = firstSelectionSet.name.value;

    if (queryName.startsWith('get')) {
        return queryName.replace('get', '') as JOObjectTypeName;
    }

    if (queryName.startsWith('find')) {
        return queryName.replace('find', '') as JOObjectTypeName;
    }

    if (queryName.startsWith('create')) {
        return queryName.replace('create', '') as JOObjectTypeName;
    }

    if (queryName.startsWith('update')) {
        return queryName.replace('update', '') as JOObjectTypeName;
    }

    if (queryName.startsWith('delete')) {
        return queryName.replace('delete', '') as JOObjectTypeName;
    }

    return `NOT_FOUND`;
}

export function isQueryAFindQuery(queryText: string): boolean {
    const documentNode: Readonly<DocumentNode> = parse(queryText);

    const operationDefinition: OperationDefinitionNode = documentNode.definitions[0] as OperationDefinitionNode;

    const firstSelectionSet = operationDefinition.selectionSet.selections[0] as FieldNode;

    const queryName: string = firstSelectionSet.name.value;

    return queryName.startsWith('find');
}

export function getFieldDefinitionNodeForFieldNode(
    objectTypeDefinitionNode: ObjectTypeDefinitionNode,
    fieldNode: FieldNode
): FieldDefinitionNode | 'NOT_FOUND' {
    const fieldDefinitionNode = objectTypeDefinitionNode.fields?.find((fieldDefinitionNode) => {
        return fieldDefinitionNode.name.value === fieldNode.name.value;
    });

    return fieldDefinitionNode || 'NOT_FOUND';
}

export function isFieldNodeARelation(
    documentNode: Readonly<DocumentNode>,
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    fieldNode: FieldNode
): boolean {
    const fieldDefinitionNode = getFieldDefinitionNodeForFieldNode(objectTypeDefinitionNode, fieldNode);

    if (fieldDefinitionNode === 'NOT_FOUND') {
        return false;
    }

    return isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type));
}

export function isFieldDefinitionNodeARelation(
    documentNode: Readonly<DocumentNode>,
    fieldDefinitionNode: Readonly<FieldDefinitionNode>
): boolean {
    return isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type));
}

export function isFieldDefinitionNodeASingleRelation(
    documentNode: Readonly<DocumentNode>,
    fieldDefinitionNode: Readonly<FieldDefinitionNode>
): boolean {
    return (
        isFieldDefinitionNodeARelation(
            documentNode,
            fieldDefinitionNode
        ) &&
        isFieldDefinitionNodeAListType(fieldDefinitionNode) === false
    );
}

export function isFieldDefinitionNodeAMultipleRelation(
    documentNode: Readonly<DocumentNode>,
    fieldDefinitionNode: Readonly<FieldDefinitionNode>
): boolean {
    return (
        isFieldDefinitionNodeARelation(
            documentNode,
            fieldDefinitionNode
        ) &&
        isFieldDefinitionNodeAListType(fieldDefinitionNode) === true
    );
}

export function isFieldNodeAListType(
    objectTypeDefinitionNode: ObjectTypeDefinitionNode,
    fieldNode: FieldNode
): boolean {
    const fieldDefinitionNode = objectTypeDefinitionNode.fields?.find((fieldDefinitionNode) => {
        return fieldDefinitionNode.name.value === fieldNode.name.value;
    });

    if (fieldDefinitionNode === undefined) {
        return false;
    }

    return isTypeAListType(fieldDefinitionNode.type);
}

export function isFieldDefinitionNodeAListType(fieldDefinitionNode: Readonly<FieldDefinitionNode>): boolean {
    return isTypeAListType(fieldDefinitionNode.type);
}

function isTypeAListType(typeNode: TypeNode): boolean {
    if (typeNode.kind === 'ListType') {
        return true;
    }

    if (typeNode.kind === 'NamedType') {
        return false;
    }

    if (typeNode.kind === 'NonNullType') {
        return isTypeAListType(typeNode.type);
    }

    return false;
}

export function isTypeANullableType(typeNode: TypeNode): boolean {
    return typeNode.kind !== 'NonNullType';
}

export function getDirectiveWithArgument(
    fieldDefinitionNode: Readonly<FieldDefinitionNode>,
    directiveName: string,
    argumentName: string
): Readonly<DirectiveNode> | undefined {
    const directiveNode: Readonly<DirectiveNode> | undefined = fieldDefinitionNode.directives?.find((directiveNode: Readonly<DirectiveNode>) => directiveNode.name.value === directiveName);
    const argumentNode: Readonly<ArgumentNode> | undefined = directiveNode?.arguments?.find((argumentNode: Readonly<ArgumentNode>) => argumentNode.name.value === argumentName);
    
    if (argumentNode === undefined) {
        return undefined;
    }

    return directiveNode;
}

export function getDirectiveArgumentValue(
    fieldDefinitionNode: Readonly<FieldDefinitionNode>,
    directiveName: string,
    argumentName: string
): any | undefined {
    const directiveNode: Readonly<DirectiveNode> | undefined = fieldDefinitionNode.directives?.find((directiveNode: Readonly<DirectiveNode>) => directiveNode.name.value === directiveName);
    const argumentNode: Readonly<ArgumentNode> | undefined = directiveNode?.arguments?.find((argumentNode: Readonly<ArgumentNode>) => argumentNode.name.value === argumentName);
    
    if (argumentNode === undefined) {
        return undefined;
    }
    
    const argumentValue: any | undefined = (argumentNode.value as StringValueNode | BooleanValueNode).value;

    return argumentValue;
}

export function getObjectTypeDefinitionNodesWithDefaultDirectives(
    objectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode>
): ReadonlyArray<ObjectTypeDefinitionNode> {
    return objectTypeDefinitionNodes.filter((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        const objectTypeDefinitonNodeHasDefaultDirective: boolean = objectTypeDefinitionNode.fields?.some((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
            return getDirectiveWithArgument(fieldDefinitionNode, 'db', 'default') !== undefined;
        }) || false;

        return objectTypeDefinitonNodeHasDefaultDirective;
    });
}

export const nestedOperationNames: ReadonlyArray<NestedOperationName> = [
    'create',
    'createMany',
    'update',
    'updateMany',
    'upsert',
    'upsertMany',
    'delete',
    'deleteMany'
];

export function getEnumTypeDefinitionNode(
    documentNode: Readonly<DocumentNode>,
    enumName: string
): Readonly<EnumTypeDefinitionNode> | 'NOT_FOUND' {
    const enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode> = getEnumTypeDefinitionNodes(documentNode);

    const enumTypeDefinitionNode: Readonly<EnumTypeDefinitionNode> | undefined = enumTypeDefinitionNodes.find((enumTypeDefinitionNode: Readonly<EnumTypeDefinitionNode>) => {
        return enumTypeDefinitionNode.name.value === enumName;
    });

    if (enumTypeDefinitionNode === undefined) {
        return 'NOT_FOUND';
    }
    else {
        return enumTypeDefinitionNode;
    }
}

export function getEnumTypeDefinitionNodes(documentNode: Readonly<DocumentNode>): ReadonlyArray<EnumTypeDefinitionNode> {
    return documentNode.definitions.filter((definitionNode: Readonly<DefinitionNode>): definitionNode is EnumTypeDefinitionNode => {
        return definitionNode.kind === 'EnumTypeDefinition';
    });
}