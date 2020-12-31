import {
    parse,
    print,
    DefinitionNode,
    ObjectTypeDefinitionNode,
    FieldDefinitionNode,
    DocumentNode,
    ArgumentNode,
    DirectiveNode,
    InputObjectTypeDefinitionNode,
    TypeNode,
    InputValueDefinitionNode
} from 'graphql';
import {
    JOObjectTypeName,
    JOTableName,
    SelectionConfig,
    SQLBuilderConfig
} from './types.d';
import {
    getModelObjectTypeDefinitionNodes,
    isTypeNameARelation,
    getNonIgnoredFieldDefinitionNodes,
    addFieldDefinitionNodesToObjectTypeDefinition,
    isListTypeNode,
    getTypeNameFromTypeNode,
    getDirectiveWithArgument,
    getObjectTypeDefinitionNodeForTypeName,
    isFieldDefinitionNodeARelation,
    isFieldDefinitionNodeASingleRelation
} from './utilities';
import { SQLBuilderConfigs } from './sql-builder-configs';

export function generateModel(model: string): string {
    const documentNode: Readonly<DocumentNode> = parse(model);

    // TODO generate the resultlist types
    
    const modelObjectTypeDefinitionNodes: ReadonlyArray<ObjectTypeDefinitionNode> = getModelObjectTypeDefinitionNodes(documentNode.definitions);

    const getFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateGetFieldDefinitionNode(objectTypeDefinitionNode));
    const findFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateFindFieldDefinitionNode(objectTypeDefinitionNode));
    
    const createFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateCreateFieldDefinitionNode(objectTypeDefinitionNode));
    const createManyFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateCreateManyFieldDefinitionNode(objectTypeDefinitionNode));
    const updateFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateUpdateFieldDefinitionNode(objectTypeDefinitionNode));
    const updateManyFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateUpdateManyFieldDefinitionNode(objectTypeDefinitionNode));
    const upsertFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateUpsertFieldDefinitionNode(objectTypeDefinitionNode));
    const upsertManyFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateUpsertManyFieldDefinitionNode(objectTypeDefinitionNode));
    const deleteFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateDeleteFieldDefinitionNode(objectTypeDefinitionNode));
    const deleteManyFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateDeleteManyFieldDefinitionNode(objectTypeDefinitionNode));

    const filterInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateFilterInputObjectTypeDefinitionNode(objectTypeDefinitionNode, documentNode));
    const createInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateCreateInputObjectTypeDefinitionNode(objectTypeDefinitionNode, documentNode));
    const updateInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateUpdateInputObjectTypeDefinitionNode(objectTypeDefinitionNode, documentNode, 'SINGLE'));
    const upsertInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = modelObjectTypeDefinitionNodes.map((objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => generateUpsertInputObjectTypeDefinitionNode(objectTypeDefinitionNode, documentNode));
    const nestedInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = modelObjectTypeDefinitionNodes.reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>) => {
        return [
            ...result,
            ...generateNestedInputObjectTypeDefinitionNodes(objectTypeDefinitionNode, documentNode)
        ];
    }, []);

    const definitionNodesWithGeneratedQuery: ReadonlyArray<DefinitionNode> = addFieldDefinitionNodesToObjectTypeDefinition(
        documentNode.definitions,
        'Query',
        [
            ...getFieldDefinitionNodes,
            ...findFieldDefinitionNodes
        ]    
    );

    const definitionNodesWithGeneratedMutation: ReadonlyArray<DefinitionNode> = addFieldDefinitionNodesToObjectTypeDefinition(
        definitionNodesWithGeneratedQuery,
        'Mutation',
        [
            ...createFieldDefinitionNodes,
            ...createManyFieldDefinitionNodes,
            ...updateFieldDefinitionNodes,
            ...updateManyFieldDefinitionNodes,
            ...upsertFieldDefinitionNodes,
            ...upsertManyFieldDefinitionNodes,
            ...deleteFieldDefinitionNodes,
            ...deleteManyFieldDefinitionNodes
        ]    
    );

    const generatedDocumentNode: Readonly<DocumentNode> = {
        ...documentNode,
        definitions: [
            ...definitionNodesWithGeneratedMutation, 
            ...filterInputObjectTypeDefinitionNodes,
            ...createInputObjectTypeDefinitionNodes,
            ...updateInputObjectTypeDefinitionNodes,
            ...upsertInputObjectTypeDefinitionNodes,
            ...nestedInputObjectTypeDefinitionNodes
        ]
    };

    return print(generatedDocumentNode);
}

function generateGetFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `get${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'id'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: 'Int'
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NamedType',
            name: {
                kind: 'Name',
                value: objectTypeDefinitionNode.name.value
            }
        }
    };
}

function generateFindFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `find${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'filter'
                },
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: `${objectTypeDefinitionNode.name.value}Filter`
                    }
                }
            },
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'page'
                },
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: 'PageRequest'
                    }
                }
            },
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'orderBy'
                },
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: 'OrderByInput'
                    }
                }
            }
        ],
        type: {
            kind: 'NonNullType',
            type: {
                kind: 'NamedType',
                name: {
                    kind: 'Name',
                    value: `${objectTypeDefinitionNode.name.value}ResultList`
                }
            }
        }
    };
}

function generateCreateFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `create${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'input'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `Create${objectTypeDefinitionNode.name.value}Input`
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NamedType',
            name: {
                kind: 'Name',
                value: objectTypeDefinitionNode.name.value
            }
        }
    };
}

function generateCreateManyFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `createMany${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'inputs'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: `Create${objectTypeDefinitionNode.name.value}Input`
                            }
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NonNullType',
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: objectTypeDefinitionNode.name.value
                    }
                }
            }
        }
    };
}

function generateUpdateFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `update${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'input'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `Update${objectTypeDefinitionNode.name.value}Input`
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NamedType',
            name: {
                kind: 'Name',
                value: objectTypeDefinitionNode.name.value
            }
        }
    };
}

function generateUpdateManyFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `updateMany${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'inputs'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: `Update${objectTypeDefinitionNode.name.value}Input`
                            }
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NonNullType',
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: objectTypeDefinitionNode.name.value
                    }
                }
            }
        }
    };
}

function generateUpsertFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `upsert${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'input'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `Upsert${objectTypeDefinitionNode.name.value}Input`
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NamedType',
            name: {
                kind: 'Name',
                value: objectTypeDefinitionNode.name.value
            }
        }
    };
}

function generateUpsertManyFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `upsertMany${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'inputs'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: `Upsert${objectTypeDefinitionNode.name.value}Input`
                            }
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NonNullType',
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: objectTypeDefinitionNode.name.value
                    }
                }
            }
        }
    };
}

function generateDeleteFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `delete${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'input'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: 'DeleteInput'
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NamedType',
            name: {
                kind: 'Name',
                value: objectTypeDefinitionNode.name.value
            }
        }
    };
}

function generateDeleteManyFieldDefinitionNode(objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>): Readonly<FieldDefinitionNode> {
    return {
        kind: 'FieldDefinition',
        name: {
            kind: 'Name',
            value: `deleteMany${objectTypeDefinitionNode.name.value}`
        },
        arguments: [
            {
                kind: 'InputValueDefinition',
                name: {
                    kind: 'Name',
                    value: 'inputs'
                },
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: `DeleteInput`
                            }
                        }
                    }
                }
            }
        ],
        type: {
            kind: 'NonNullType',
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: objectTypeDefinitionNode.name.value
                    }
                }
            }
        }
    };
}

function generateFilterInputObjectTypeDefinitionNode(
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    documentNode: Readonly<DocumentNode>
): Readonly<InputObjectTypeDefinitionNode> {
    
    const nonIgnoredFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields === undefined ? [] : getNonIgnoredFieldDefinitionNodes(objectTypeDefinitionNode.fields);
    const nonListTypeFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = nonIgnoredFieldDefinitionNodes.filter((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => !isListTypeNode(fieldDefinitionNode.type));
    
    return {
        kind: 'InputObjectTypeDefinition',
        name: {
            kind: 'Name',
            value: `${objectTypeDefinitionNode.name.value}Filter`
        },
        fields: [...nonListTypeFieldDefinitionNodes.map((fieldDefinitionNode: Readonly<FieldDefinitionNode>): Readonly<InputValueDefinitionNode> => {
            
            const isRelation: boolean = isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type));
            const dbDirectiveNode: Readonly<DirectiveNode> | undefined = fieldDefinitionNode.directives?.find((directiveNode: Readonly<DirectiveNode>) => directiveNode.name.value === 'db');
            const fieldArgumentNode: Readonly<ArgumentNode> | undefined = dbDirectiveNode?.arguments?.find((argumentNode: Readonly<ArgumentNode>) => argumentNode.name.value === 'field');
            const dbField: string | undefined = fieldArgumentNode?.value.kind === 'StringValue' ? fieldArgumentNode.value.value : undefined;

            return {
                kind: 'InputValueDefinition',
                name: isRelation ? {
                    kind: 'Name',
                    value: dbField === undefined ? `${fieldDefinitionNode.name.value}_id` : dbField
                } : fieldDefinitionNode.name,
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: getFilterInputNameForTypeNode(fieldDefinitionNode.type, documentNode)
                    }
                }
            };
        }), {
            kind: 'InputValueDefinition',
            name: {
                kind: 'Name',
                value: 'and'
            },
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `${objectTypeDefinitionNode.name.value}Filter`
                        }
                    }
                }
            }
        }, {
            kind: 'InputValueDefinition',
            name: {
                kind: 'Name',
                value: 'or'
            },
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `${objectTypeDefinitionNode.name.value}Filter`
                        }
                    }
                }
            }
        }, {
            kind: 'InputValueDefinition',
            name: {
                kind: 'Name',
                value: 'not'
            },
            type: {
                kind: 'ListType',
                type: {
                    kind: 'NonNullType',
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `${objectTypeDefinitionNode.name.value}Filter`
                        }
                    }
                }
            }
        }]
    };
}

function generateCreateInputObjectTypeDefinitionNode(
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    documentNode: Readonly<DocumentNode>,
    parentTypeName?: JOObjectTypeName,
    parentEntityGQLFieldName?: string,
    parentRelationGQLFieldName?: string
): Readonly<InputObjectTypeDefinitionNode> {
    const nonIgnoredFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields === undefined ? [] : getNonIgnoredFieldDefinitionNodes(objectTypeDefinitionNode.fields);

    return {
        kind: 'InputObjectTypeDefinition',
        name: {
            kind: 'Name',
            value: `Create${parentTypeName || ''}${parentTypeName ? `${parentRelationGQLFieldName}` : objectTypeDefinitionNode.name.value}Input`
        },
        fields: nonIgnoredFieldDefinitionNodes.map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
            if (fieldDefinitionNode.name.value === 'id') {
                return {
                    kind: 'InputValueDefinition',
                    name: fieldDefinitionNode.name,
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: 'Int'
                        }
                    }
                };
            }

            if (
                fieldDefinitionNode.type.kind === 'NonNullType' &&
                !isListTypeNode(fieldDefinitionNode.type) &&
                fieldDefinitionNode.name.value !== 'created_at' &&
                fieldDefinitionNode.name.value !== 'updated_at' &&
                getDirectiveWithArgument(fieldDefinitionNode, 'db', 'default') === undefined &&
                fieldDefinitionNode.name.value !== parentEntityGQLFieldName
            ) {
                return {
                    kind: 'InputValueDefinition',
                    name: fieldDefinitionNode.name,
                    type: {
                        kind: 'NonNullType',
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type)) ? `Nested${objectTypeDefinitionNode.name.value}${fieldDefinitionNode.name.value}Input` : getTypeNameFromTypeNode(fieldDefinitionNode.type)
                            }
                        }
                    }
                };
            }

            return {
                kind: 'InputValueDefinition',
                name: fieldDefinitionNode.name,
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type)) ? `Nested${objectTypeDefinitionNode.name.value}${fieldDefinitionNode.name.value}Input` : getTypeNameFromTypeNode(fieldDefinitionNode.type)
                    }
                }
            };
        })
    };
}

function generateUpdateInputObjectTypeDefinitionNode(
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    documentNode: Readonly<DocumentNode>,
    singleOrMultipleRelation: 'SINGLE' | 'MULTIPLE',
    parentTypeName?: JOObjectTypeName,
    parentRelationGQLFieldName?: string
): Readonly<InputObjectTypeDefinitionNode> {

    const nonIgnoredFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields === undefined ? [] : getNonIgnoredFieldDefinitionNodes(objectTypeDefinitionNode.fields);

    return {
        kind: 'InputObjectTypeDefinition',
        name: {
            kind: 'Name',
            value: `Update${parentTypeName || ''}${parentTypeName ? `${parentRelationGQLFieldName}` : objectTypeDefinitionNode.name.value}Input`
        },
        fields: nonIgnoredFieldDefinitionNodes.map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
            if (fieldDefinitionNode.name.value === 'id') {
                if (singleOrMultipleRelation === 'SINGLE') {
                    return {
                        kind: 'InputValueDefinition',
                        name: fieldDefinitionNode.name,
                        type: {
                            kind: 'NonNullType',
                            type: {
                                kind: 'NamedType',
                                name: {
                                    kind: 'Name',
                                    value: 'Int'
                                }
                            }
                        }
                    };
                }
                else {
                    return {
                        kind: 'InputValueDefinition',
                        name: fieldDefinitionNode.name,
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: 'Int'
                            }
                        }
                    };
                }
            }

            return {
                kind: 'InputValueDefinition',
                name: fieldDefinitionNode.name,
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type)) ? `Nested${objectTypeDefinitionNode.name.value}${fieldDefinitionNode.name.value}Input` : getTypeNameFromTypeNode(fieldDefinitionNode.type)
                    }
                }
            };
        })
    };
}

function generateUpsertInputObjectTypeDefinitionNode(
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    documentNode: Readonly<DocumentNode>,
    parentTypeName?: JOObjectTypeName,
    parentEntityGQLFieldName?: string,
    parentRelationGQLFieldName?: string
): Readonly<InputObjectTypeDefinitionNode> {
    const nonIgnoredFieldDefinitionNodes: ReadonlyArray<FieldDefinitionNode> = objectTypeDefinitionNode.fields === undefined ? [] : getNonIgnoredFieldDefinitionNodes(objectTypeDefinitionNode.fields);

    return {
        kind: 'InputObjectTypeDefinition',
        name: {
            kind: 'Name',
            value: `Upsert${parentTypeName || ''}${parentTypeName ? `${parentRelationGQLFieldName}` : objectTypeDefinitionNode.name.value}Input`
        },
        fields: nonIgnoredFieldDefinitionNodes.map((fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
            if (fieldDefinitionNode.name.value === 'id') {
                return {
                    kind: 'InputValueDefinition',
                    name: fieldDefinitionNode.name,
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: 'Int'
                        }
                    }
                };
            }

            if (
                fieldDefinitionNode.type.kind === 'NonNullType' &&
                !isListTypeNode(fieldDefinitionNode.type) &&
                fieldDefinitionNode.name.value !== 'created_at' &&
                fieldDefinitionNode.name.value !== 'updated_at' &&
                getDirectiveWithArgument(fieldDefinitionNode, 'db', 'default') === undefined &&
                fieldDefinitionNode.name.value !== parentEntityGQLFieldName
            ) {
                return {
                    kind: 'InputValueDefinition',
                    name: fieldDefinitionNode.name,
                    type: {
                        kind: 'NonNullType',
                        type: {
                            kind: 'NamedType',
                            name: {
                                kind: 'Name',
                                value: isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type)) ? `Nested${objectTypeDefinitionNode.name.value}${fieldDefinitionNode.name.value}Input` : getTypeNameFromTypeNode(fieldDefinitionNode.type)
                            }
                        }
                    }
                };
            }

            return {
                kind: 'InputValueDefinition',
                name: fieldDefinitionNode.name,
                type: {
                    kind: 'NamedType',
                    name: {
                        kind: 'Name',
                        value: isTypeNameARelation(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type)) ? `Nested${objectTypeDefinitionNode.name.value}${fieldDefinitionNode.name.value}Input` : getTypeNameFromTypeNode(fieldDefinitionNode.type)
                    }
                }
            };
        })
    };
}

// TODO work on nested updates
// TODO on single relation updates, we might want to implicitly connect...multiple relation updates we need the specific id
// TODO on single relation updates, we can do an implicit connect, no id necessary?
// TODO on multiple relation updates, we'll take an array of update inputs that must have ids
// TODO maybe they should all just require ids then?
function generateNestedInputObjectTypeDefinitionNodes(
    objectTypeDefinitionNode: Readonly<ObjectTypeDefinitionNode>,
    documentNode: Readonly<DocumentNode>
): ReadonlyArray<InputObjectTypeDefinitionNode> {
    const objectTypeName: JOObjectTypeName = objectTypeDefinitionNode.name.value as JOObjectTypeName;
    
    const createInputObjectTypeDefinitionNodes: ReadonlyArray<InputObjectTypeDefinitionNode> = objectTypeDefinitionNode.fields?.filter((fieldDefinitionNode) => {
        return isFieldDefinitionNodeARelation(documentNode, fieldDefinitionNode) === true;
    }).reduce((result: ReadonlyArray<InputObjectTypeDefinitionNode>, fieldDefinitionNode: Readonly<FieldDefinitionNode>) => {
        const sqlBuilderConfig: Readonly<SQLBuilderConfig> | undefined = SQLBuilderConfigs[objectTypeName.toLowerCase() as JOTableName];

        if (sqlBuilderConfig === undefined) {
            throw new Error(`buildRelationConnectorOrDisconnectorQueries: sqlBuilderConfig for table ${objectTypeName.toLowerCase()} not found`);
        }

        const selectionConfig: Readonly<SelectionConfig> | undefined = sqlBuilderConfig[fieldDefinitionNode.name.value];

        if (selectionConfig === undefined) {
            throw new Error(`buildRelationConnectorOrDisconnectorQueries: selectionConfig for table ${objectTypeName.toLowerCase()} and selection ${fieldDefinitionNode.name.value} not found`);
        }

        const relationGQLFieldName: string | undefined = selectionConfig.relationGQLFieldName;

        // const objectTypeDefinitionNode = getObjectTypeDefinitionNodeForTypeName(documentNode, fieldDefinitionNode.type);
        const relationObjectTypeDefinitionNode = getObjectTypeDefinitionNodeForTypeName(documentNode, getTypeNameFromTypeNode(fieldDefinitionNode.type) as JOObjectTypeName);

        const createInputObjectTypeDefinitionNode = generateCreateInputObjectTypeDefinitionNode(
            relationObjectTypeDefinitionNode,
            documentNode,
            objectTypeName,
            relationGQLFieldName,
            fieldDefinitionNode.name.value
        );

        const fieldDefinitionNodeIsMultipleRelation = isFieldDefinitionNodeASingleRelation(documentNode, fieldDefinitionNode);

        const updateInputObjectTypeDefinitionNode = generateUpdateInputObjectTypeDefinitionNode(
            relationObjectTypeDefinitionNode,
            documentNode,
            fieldDefinitionNodeIsMultipleRelation === true ? 'MULTIPLE' : 'SINGLE',
            objectTypeName,
            fieldDefinitionNode.name.value
        );

        const upsertInputObjectTypeDefinitionNode = generateUpsertInputObjectTypeDefinitionNode(
            relationObjectTypeDefinitionNode,
            documentNode,
            objectTypeName,
            relationGQLFieldName,
            fieldDefinitionNode.name.value
        );

        const nestedInputObjectTypeDefinitionNode: Readonly<InputObjectTypeDefinitionNode> = {
            kind: 'InputObjectTypeDefinition',
            name: {
                kind: 'Name',
                value: `Nested${objectTypeName}${fieldDefinitionNode.name.value}Input`
            },
            fields: [
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'connect'
                    },
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: 'RelationIDInput'
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'disconnect'
                    },
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: 'RelationIDInput'
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'create'
                    },
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `Create${objectTypeName}${fieldDefinitionNode.name.value}Input`
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'createMany'
                    },
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NonNullType',
                            type: {
                                kind: 'NamedType',
                                name: {
                                    kind: 'Name',
                                    value: `Create${objectTypeName}${fieldDefinitionNode.name.value}Input`
                                }
                            }
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'update'
                    },
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `Update${objectTypeName}${fieldDefinitionNode.name.value}Input`
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'updateMany'
                    },
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NonNullType',
                            type: {
                                kind: 'NamedType',
                                name: {
                                    kind: 'Name',
                                    value: `Update${objectTypeName}${fieldDefinitionNode.name.value}Input`
                                }
                            }
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'upsert'
                    },
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `Upsert${objectTypeName}${fieldDefinitionNode.name.value}Input`
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'upsertMany'
                    },
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NonNullType',
                            type: {
                                kind: 'NamedType',
                                name: {
                                    kind: 'Name',
                                    value: `Upsert${objectTypeName}${fieldDefinitionNode.name.value}Input`
                                }
                            }
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'delete'
                    },
                    type: {
                        kind: 'NamedType',
                        name: {
                            kind: 'Name',
                            value: `DeleteInput`
                        }
                    }
                },
                {
                    kind: 'InputValueDefinition',
                    name: {
                        kind: 'Name',
                        value: 'deleteMany'
                    },
                    type: {
                        kind: 'ListType',
                        type: {
                            kind: 'NonNullType',
                            type: {
                                kind: 'NamedType',
                                name: {
                                    kind: 'Name',
                                    value: `DeleteInput`
                                }
                            }
                        }
                    }
                }
            ]
        };

        return [
            ...result,
            createInputObjectTypeDefinitionNode,
            updateInputObjectTypeDefinitionNode,
            upsertInputObjectTypeDefinitionNode,
            nestedInputObjectTypeDefinitionNode
        ];
    }, []) || [];


    return createInputObjectTypeDefinitionNodes;
}

function getFilterInputNameForTypeNode(
    typeNode: Readonly<TypeNode>,
    documentNode: Readonly<DocumentNode>
): string {
    if (typeNode.kind === 'NonNullType') {
        return getFilterInputNameForTypeNode(typeNode.type, documentNode);
    }

    if (typeNode.kind === 'NamedType') {
        if (typeNode.name.value === 'Int') {
            return 'IntInput';
        }

        if (typeNode.name.value === 'String') {
            return 'StringInput';
        }

        if (typeNode.name.value === 'DateTime') {
            return 'DateTimeInput';
        }

        if (typeNode.name.value === 'Boolean') {
            return 'BooleanInput';
        }

        if (isTypeNameARelation(documentNode, typeNode.name.value)) {
            return 'IDInput';
        }

        return 'StringInput'; // TODO we are impliciting setting enums to strings here...we should probably do it explicitly
    }

    throw new Error(`getFilterInputNameForTypeNode: This should not happen`);
}