import * as fs from 'fs';
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
    NonNullTypeNode,
} from 'graphql';

export type SchemaAST = {
    readonly documentNode: Readonly<DocumentNode>;
    // readonly scalarTypeDefinitionNodes: ReadonlyArray<ScalarTypeDefinitionNode>; TODO maybe add these later, but we don't need them yet
    // readonly directiveDefinitionNodes: ReadonlyArray<DirectiveDefinitionNode>;
    readonly objectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode>;
    readonly modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode>;
    readonly resultListObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode>;
    readonly enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode>
    readonly inputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>;
    readonly createInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>;
    readonly updateInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>;
    readonly filterInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>;
    readonly scalarFilterInputTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>;
    readonly idFilterTypes: ReadonlyArray<string>;
    readonly stringFilterTypes: ReadonlyArray<string>;
    readonly dateTimeFilterTypes: ReadonlyArray<string>;
};

export function generateSchemaAST(): Readonly<SchemaAST> {
    const model: string = fs.readFileSync('./graphql/schema-generated.graphql').toString();
    const documentNode: Readonly<DocumentNode> = parse(model);

    const objectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getObjectTypeDefinitionNodes(documentNode);
    
    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(objectTypeDefinitionNodes);

    const resultListObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getResultListObjectTypeDefinitionNodes(objectTypeDefinitionNodes);

    const enumTypeDefinitionNodes: ReadonlyArray<EnumTypeDefinitionNode> = getEnumTypeDefinitionNodes(documentNode);

    const inputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = getInputObjectTypeDefinitionNodes(documentNode);

    const createInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = getCreateInputObjectTypeDefinitionNodes(inputObjectTypeDefinitionNodes);

    const updateInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = getUpdateInputObjectTypeDefinitionNodes(inputObjectTypeDefinitionNodes);    

    const filterInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = getFilterInputObjectTypeDefinitionNodes(inputObjectTypeDefinitionNodes);

    const scalarFilterInputTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = getScalarFilterInputTypeDefinitionNodes(documentNode);

    const idFilterTypes: ReadonlyArray<string> = getIDFilterTypes(scalarFilterInputTypeDefinitionNodes);

    const stringFilterTypes: ReadonlyArray<string> = getStringFilterTypes(scalarFilterInputTypeDefinitionNodes);

    const dateTimeFilterTypes: ReadonlyArray<string> = getDateTimeFilterTypes(scalarFilterInputTypeDefinitionNodes);

    const schemaAST: Readonly<SchemaAST> = {
        documentNode,
        objectTypeDefinitionNodes,
        modelObjectTypeDefinitionNodes,
        resultListObjectTypeDefinitionNodes,
        enumTypeDefinitionNodes,
        inputObjectTypeDefinitionNodes,
        createInputObjectTypeDefinitionNodes,
        updateInputObjectTypeDefinitionNodes,
        filterInputObjectTypeDefinitionNodes,
        scalarFilterInputTypeDefinitionNodes,
        idFilterTypes,
        stringFilterTypes,
        dateTimeFilterTypes
    };

    return schemaAST;
}

function getObjectTypeDefinitionNodes(
    documentNode: Readonly<DocumentNode>
): ReadonlyArray<ObjectTypeDefinitionNode> {
    return documentNode.definitions.reduce((result: ReadonlyArray<ObjectTypeDefinitionNode>, currentDefinitionNode: Readonly<DefinitionNode>) => {
        if (currentDefinitionNode.kind === 'ObjectTypeDefinition') {
            return [...result, currentDefinitionNode];
        }
        return result;
    }, []);
}

function getModelObjectTypeDefinitionNodes(
    objectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode>
): ReadonlyArray<ObjectTypeDefinitionNode> {
    return objectTypeDefinitionNodes.reduce((result: ReadonlyArray<ObjectTypeDefinitionNode>, currentDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        if (
            currentDefinitionNode.kind === 'ObjectTypeDefinition' &&
            containsModelDirective(currentDefinitionNode.directives)
        ) {
            return [...result, currentDefinitionNode];
        }
        return result;
    }, []);
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

function getResultListObjectTypeDefinitionNodes(
    objectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode>
): ReadonlyArray<ObjectTypeDefinitionNode> {
    return objectTypeDefinitionNodes.reduce((result: ReadonlyArray<ObjectTypeDefinitionNode>, currentTypeDef: Readonly<ObjectTypeDefinitionNode>) => {
        if (currentTypeDef.name.value.includes('ResultList')) {
            return [...result, currentTypeDef];
        }
        return result;
    }, []);
}

function getEnumTypeDefinitionNodes(documentNode: Readonly<DocumentNode>): ReadonlyArray<EnumTypeDefinitionNode> {
    return documentNode.definitions.reduce((result: ReadonlyArray<EnumTypeDefinitionNode>, currentDefinitionNode: Readonly<DefinitionNode>) => {
        if (currentDefinitionNode.kind === 'EnumTypeDefinition') {
            return [...result, currentDefinitionNode];
        }
        return result;
    }, []);
}

function getInputObjectTypeDefinitionNodes(
    documentNode: Readonly<DocumentNode>
): ReadonlyArray<InputObjectTypeDefinitionNode> {
    return documentNode.definitions.reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, currentDefinitionNode: Readonly<DefinitionNode>) => {
        if (
            currentDefinitionNode.kind === 'InputObjectTypeDefinition' 
        ) {
            return [...result, currentDefinitionNode]
        }

        return result;
    }, []);
}

function getCreateInputObjectTypeDefinitionNodes(
    inputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>
): ReadonlyArray<InputObjectTypeDefinitionNode> {
    return inputObjectTypeDefinitionNodes.reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, currentInputTypeDef: Readonly<InputObjectTypeDefinitionNode>) => {
        if (currentInputTypeDef.name.value.startsWith('Create')) {
            return [...result, currentInputTypeDef];
        }
        return result;
    }, []);
}

function getUpdateInputObjectTypeDefinitionNodes(
    inputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>
): ReadonlyArray<InputObjectTypeDefinitionNode> {
    return inputObjectTypeDefinitionNodes.reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, currentInputTypeDef: Readonly<InputObjectTypeDefinitionNode>) => {
        if (currentInputTypeDef.name.value.startsWith('Update')) {
            return [...result, currentInputTypeDef];
        }
        return result;
    }, []);
}

function getFilterInputObjectTypeDefinitionNodes(
    inputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>
): ReadonlyArray<InputObjectTypeDefinitionNode> {
    return inputObjectTypeDefinitionNodes.reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, currentInputTypeDef: Readonly<InputObjectTypeDefinitionNode>) => {
        if (currentInputTypeDef.name.value.endsWith('Filter')) {
            return [...result, currentInputTypeDef];
        }
        return result;
    }, []);
}

function getScalarFilterInputTypeDefinitionNodes(
    documentNode: Readonly<DocumentNode>
): ReadonlyArray<InputObjectTypeDefinitionNode> {
    const scalarInputNames: ReadonlyArray<string> = ['IDInput', 'DateTimeInput', 'StringInput'];
    
    return documentNode.definitions.reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, currentDefinitionNode: Readonly<DefinitionNode>) => {
        if (
            currentDefinitionNode.kind === 'InputObjectTypeDefinition' &&
            scalarInputNames.includes(currentDefinitionNode.name.value)
        ) {
            return [...result, currentDefinitionNode];
        }
        return result;
    }, []);
}

function getIDFilterTypes(
    scalarFilterInputTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>
): ReadonlyArray<string> {
    const idInputFilterTypeDefNode: Readonly<InputObjectTypeDefinitionNode> = scalarFilterInputTypeDefinitionNodes.filter((node: Readonly<InputObjectTypeDefinitionNode>) => node.name.value === 'IDInput')[0];
    
    const idFilterTypes: ReadonlyArray<string> = idInputFilterTypeDefNode.fields!.map((field: Readonly<InputValueDefinitionNode>) => field.name.value);

    return idFilterTypes;
}

function getStringFilterTypes(
    scalarFilterInputTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>
): ReadonlyArray<string> {
    const stringInputFilterTypeDefNode: Readonly<InputObjectTypeDefinitionNode> = scalarFilterInputTypeDefinitionNodes.filter((node: Readonly<InputObjectTypeDefinitionNode>) => node.name.value === 'StringInput')[0];

    const stringFilterTypes: ReadonlyArray<string> = stringInputFilterTypeDefNode.fields!.map((field: Readonly<InputValueDefinitionNode>) => field.name.value);

    return stringFilterTypes;
}

function getDateTimeFilterTypes(
    scalarFilterInputTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode>
): ReadonlyArray<string> {
    const dateTimeInputFilterTypeDefNode: Readonly<InputObjectTypeDefinitionNode> = scalarFilterInputTypeDefinitionNodes.filter((node: Readonly<InputObjectTypeDefinitionNode>) => node.name.value === 'DateTimeInput')[0];

    const dateTimeFilterTypes: ReadonlyArray<string> = dateTimeInputFilterTypeDefNode.fields!.map((field: Readonly<InputValueDefinitionNode>) => field.name.value);

    return dateTimeFilterTypes;
}