import { dirname } from "node:path";

import ts from "typescript";

import type {
  MdxExtractedProp,
  MdxExtractedProps,
} from "../contracts/extensibility.js";

export function extractMdxComponentProps(input: {
  filePath: string;
  componentName: string;
  propHints?: Record<string, unknown>;
  tsconfigPath?: string;
}): MdxExtractedProps {
  const program = createProgram(input.filePath, input.tsconfigPath);
  const sourceFile = program.getSourceFile(input.filePath);

  if (!sourceFile) {
    throw new Error(
      `Could not load component source file "${input.filePath}".`,
    );
  }

  const checker = program.getTypeChecker();
  const componentSymbol = resolveComponentSymbol(
    checker,
    sourceFile,
    input.componentName,
  );

  if (!componentSymbol) {
    throw new Error(
      `Could not find exported component "${input.componentName}" in "${input.filePath}".`,
    );
  }

  const propsType = resolvePropsType(checker, componentSymbol);

  if (!propsType) {
    return {};
  }

  const propHints = input.propHints ?? {};
  const extractedProps: MdxExtractedProps = {};

  for (const property of checker.getPropertiesOfType(propsType)) {
    const propertyName = property.getName();
    const propertyDeclaration =
      property.valueDeclaration ?? property.getDeclarations()?.[0];

    if (!propertyDeclaration) {
      continue;
    }

    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      propertyDeclaration,
    );
    const required = !isOptionalProperty(property, propertyType);
    const normalizedProperty = normalizePropType({
      checker,
      propertyName,
      propertyType,
      required,
      propHint: propHints[propertyName],
      seenTypes: new Set(),
    });

    if (normalizedProperty) {
      extractedProps[propertyName] = normalizedProperty;
    }
  }

  return extractedProps;
}

function createProgram(filePath: string, tsconfigPath?: string): ts.Program {
  if (tsconfigPath) {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

    if (configFile.error) {
      throw new Error(
        ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n"),
      );
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(tsconfigPath),
      {
        noEmit: true,
      },
      tsconfigPath,
    );

    return ts.createProgram({
      rootNames: parsedConfig.fileNames.includes(filePath)
        ? parsedConfig.fileNames
        : [...parsedConfig.fileNames, filePath],
      options: parsedConfig.options,
    });
  }

  return ts.createProgram({
    rootNames: [filePath],
    options: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      jsx: ts.JsxEmit.ReactJSX,
      allowJs: false,
      checkJs: false,
      noEmit: true,
      strict: true,
      skipLibCheck: true,
      esModuleInterop: true,
    },
  });
}

function resolveComponentSymbol(
  checker: ts.TypeChecker,
  sourceFile: ts.SourceFile,
  componentName: string,
): ts.Symbol | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);

  if (!moduleSymbol) {
    return undefined;
  }

  const exportSymbols = checker
    .getExportsOfModule(moduleSymbol)
    .map((symbol) =>
      symbol.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(symbol)
        : symbol,
    );
  const exportSymbol = exportSymbols.find(
    (candidate) => candidate.getName() === componentName,
  );

  if (exportSymbol) {
    return exportSymbol;
  }

  const defaultExportSymbol = exportSymbols.find(
    (candidate) => candidate.getName() === "default",
  );

  if (defaultExportSymbol && isComponentSymbol(checker, defaultExportSymbol)) {
    return defaultExportSymbol;
  }

  const componentExports = exportSymbols.filter((candidate) =>
    isComponentSymbol(checker, candidate),
  );

  return componentExports.length === 1 ? componentExports[0] : undefined;
}

function resolvePropsType(
  checker: ts.TypeChecker,
  componentSymbol: ts.Symbol,
): ts.Type | undefined {
  const componentDeclaration =
    componentSymbol.valueDeclaration ?? componentSymbol.getDeclarations()?.[0];

  if (!componentDeclaration) {
    return undefined;
  }

  const classPropsType = resolveClassComponentPropsType(
    checker,
    componentSymbol,
    componentDeclaration,
  );
  if (classPropsType) {
    return classPropsType;
  }

  const componentType = checker.getTypeOfSymbolAtLocation(
    componentSymbol,
    componentDeclaration,
  );
  const componentSignature = componentType.getCallSignatures()[0];
  const propsSymbol = componentSignature?.getParameters()[0];

  if (!propsSymbol) {
    return undefined;
  }

  const propsDeclaration =
    propsSymbol.valueDeclaration ?? propsSymbol.getDeclarations()?.[0];

  if (!propsDeclaration) {
    return undefined;
  }

  return checker.getTypeOfSymbolAtLocation(propsSymbol, propsDeclaration);
}

function isCallableSymbol(checker: ts.TypeChecker, symbol: ts.Symbol): boolean {
  const declaration = symbol.valueDeclaration ?? symbol.getDeclarations()?.[0];

  if (!declaration) {
    return false;
  }

  return (
    checker.getTypeOfSymbolAtLocation(symbol, declaration).getCallSignatures()
      .length > 0
  );
}

function isComponentSymbol(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
): boolean {
  const declaration = symbol.valueDeclaration ?? symbol.getDeclarations()?.[0];

  if (!declaration) {
    return false;
  }

  return (
    isCallableSymbol(checker, symbol) ||
    resolveClassComponentPropsType(checker, symbol, declaration) !== undefined
  );
}

function resolveClassComponentPropsType(
  checker: ts.TypeChecker,
  componentSymbol: ts.Symbol,
  declaration: ts.Declaration,
): ts.Type | undefined {
  if (
    !ts.isClassDeclaration(declaration) &&
    !ts.isClassExpression(declaration)
  ) {
    return undefined;
  }

  const extendedType = declaration.heritageClauses
    ?.filter((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword)
    .flatMap((clause) => clause.types)
    .find((heritageType) => heritageType.typeArguments?.[0] !== undefined);
  const propsTypeNode = extendedType?.typeArguments?.[0];

  if (propsTypeNode) {
    return checker.getTypeFromTypeNode(propsTypeNode);
  }

  const componentType = checker.getTypeOfSymbolAtLocation(
    componentSymbol,
    declaration,
  );
  const propsSymbol = componentType.getProperty("props");
  const propsDeclaration =
    propsSymbol?.valueDeclaration ?? propsSymbol?.getDeclarations()?.[0];

  return propsSymbol && propsDeclaration
    ? checker.getTypeOfSymbolAtLocation(propsSymbol, propsDeclaration)
    : undefined;
}

function normalizePropType(input: {
  checker: ts.TypeChecker;
  propertyName: string;
  propertyType: ts.Type;
  required: boolean;
  propHint: unknown;
  seenTypes: Set<ts.Type>;
}): MdxExtractedProp | undefined {
  const { checker, propertyName, propertyType, required, propHint, seenTypes } =
    input;

  if (
    (propertyName === "children" &&
      isRenderableChildrenType(propertyType, checker)) ||
    isReactNodeType(propertyType, checker)
  ) {
    return { type: "rich-text", required };
  }

  if (
    isFunctionLikeType(propertyType) ||
    isRefLikeType(propertyType, checker)
  ) {
    return undefined;
  }

  const singleDefinedType = unwrapSingleDefinedUnionMember(propertyType);
  if (singleDefinedType) {
    return normalizePropType({
      checker,
      propertyName,
      propertyType: singleDefinedType,
      required,
      propHint,
      seenTypes,
    });
  }

  if (
    isJsonHint(propHint) &&
    isJsonSerializableType(propertyType, checker, seenTypes)
  ) {
    return { type: "json", required };
  }

  const stringEnumValues = getStringEnumValues(propertyType);
  if (stringEnumValues) {
    return {
      type: "enum",
      required,
      values: stringEnumValues,
    };
  }

  if (isStringType(propertyType)) {
    return { type: "string", required };
  }

  if (isNumberType(propertyType)) {
    return { type: "number", required };
  }

  if (isBooleanType(propertyType)) {
    return { type: "boolean", required };
  }

  if (isDateType(propertyType)) {
    return { type: "date", required };
  }

  const arrayItems = getSupportedArrayItemType(propertyType, checker);
  if (arrayItems) {
    return {
      type: "array",
      required,
      items: arrayItems,
    };
  }

  return undefined;
}

function isOptionalProperty(
  property: ts.Symbol,
  propertyType: ts.Type,
): boolean {
  return (
    (property.getFlags() & ts.SymbolFlags.Optional) !== 0 ||
    unionIncludesUndefined(propertyType)
  );
}

function unwrapSingleDefinedUnionMember(type: ts.Type): ts.Type | undefined {
  if (!type.isUnion()) {
    return undefined;
  }

  const definedTypes = type.types.filter(
    (candidate) => (candidate.flags & ts.TypeFlags.Undefined) === 0,
  );

  return definedTypes.length === 1 ? definedTypes[0] : undefined;
}

function unionIncludesUndefined(type: ts.Type): boolean {
  return type.isUnion()
    ? type.types.some(
        (candidate) => (candidate.flags & ts.TypeFlags.Undefined) !== 0,
      )
    : (type.flags & ts.TypeFlags.Undefined) !== 0;
}

function getStringEnumValues(type: ts.Type): string[] | undefined {
  if (type.isUnion()) {
    const definedTypes = type.types.filter(
      (candidate) => (candidate.flags & ts.TypeFlags.Undefined) === 0,
    );
    const values = definedTypes
      .filter((candidate) => (candidate.flags & ts.TypeFlags.Undefined) === 0)
      .map((candidate) =>
        candidate.isStringLiteral() ? candidate.value : undefined,
      )
      .filter((candidate): candidate is string => candidate !== undefined);

    if (values.length === definedTypes.length && values.length > 0) {
      return values;
    }
  }

  if (type.isStringLiteral()) {
    return [type.value];
  }

  return undefined;
}

function getSupportedArrayItemType(
  type: ts.Type,
  checker: ts.TypeChecker,
): "string" | "number" | undefined {
  if (!checker.isArrayType(type)) {
    return undefined;
  }

  const [itemType] = checker.getTypeArguments(type as ts.TypeReference);

  if (!itemType) {
    return undefined;
  }

  if (isStringType(itemType)) {
    return "string";
  }

  if (isNumberType(itemType)) {
    return "number";
  }

  return undefined;
}

function isReactNodeType(type: ts.Type, checker: ts.TypeChecker): boolean {
  return (
    type.aliasSymbol?.getName() === "ReactNode" ||
    type.symbol?.getName() === "ReactNode" ||
    checker.typeToString(type) === "ReactNode"
  );
}

function isRenderableChildrenType(
  type: ts.Type,
  checker: ts.TypeChecker,
): boolean {
  if (isReactNodeType(type, checker)) {
    return true;
  }

  if (type.isUnion()) {
    return type.types.every((candidate) =>
      isRenderableChildrenType(candidate, checker),
    );
  }

  return (
    (type.flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.Undefined)) !==
    0
  );
}

function isRefLikeType(type: ts.Type, checker: ts.TypeChecker): boolean {
  if (type.isUnion()) {
    return type.types.some((candidate) => isRefLikeType(candidate, checker));
  }

  const typeName =
    type.aliasSymbol?.getName() ??
    type.symbol?.getName() ??
    checker.typeToString(type);

  return /(?:^|\.)(Ref|RefObject|MutableRefObject|LegacyRef|ForwardedRef)$/.test(
    typeName,
  );
}

function isFunctionLikeType(type: ts.Type): boolean {
  if (type.getCallSignatures().length > 0) {
    return true;
  }

  return type.isUnion()
    ? type.types.some((candidate) => isFunctionLikeType(candidate))
    : false;
}

function isStringType(type: ts.Type): boolean {
  return (
    (type.flags & ts.TypeFlags.StringLike) !== 0 && !type.isStringLiteral()
  );
}

function isNumberType(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.NumberLike) !== 0;
}

function isBooleanType(type: ts.Type): boolean {
  return (type.flags & ts.TypeFlags.BooleanLike) !== 0;
}

function isDateType(type: ts.Type): boolean {
  return type.symbol?.getName() === "Date";
}

function isJsonHint(propHint: unknown): boolean {
  return (
    typeof propHint === "object" &&
    propHint !== null &&
    "widget" in propHint &&
    (propHint as { widget?: unknown }).widget === "json"
  );
}

function isJsonSerializableType(
  type: ts.Type,
  checker: ts.TypeChecker,
  seenTypes: Set<ts.Type>,
): boolean {
  if (seenTypes.has(type)) {
    return true;
  }

  seenTypes.add(type);

  if (
    (type.flags &
      (ts.TypeFlags.StringLike |
        ts.TypeFlags.NumberLike |
        ts.TypeFlags.BooleanLike |
        ts.TypeFlags.Null |
        ts.TypeFlags.BigIntLike)) !==
    0
  ) {
    return (type.flags & ts.TypeFlags.BigIntLike) === 0;
  }

  if (type.getCallSignatures().length > 0 || isDateType(type)) {
    return false;
  }

  if (type.isUnion()) {
    return type.types.every((candidate) =>
      candidate.flags & ts.TypeFlags.Undefined
        ? true
        : isJsonSerializableType(candidate, checker, seenTypes),
    );
  }

  if (checker.isArrayType(type)) {
    const [itemType] = checker.getTypeArguments(type as ts.TypeReference);
    return itemType
      ? isJsonSerializableType(itemType, checker, seenTypes)
      : false;
  }

  if (checker.isTupleType(type)) {
    const tupleType = type as ts.TupleTypeReference;
    return checker
      .getTypeArguments(tupleType)
      .every((candidate) =>
        isJsonSerializableType(candidate, checker, seenTypes),
      );
  }

  const stringIndexType = type.getStringIndexType();
  if (stringIndexType) {
    return isJsonSerializableType(stringIndexType, checker, seenTypes);
  }

  const numberIndexType = type.getNumberIndexType();
  if (numberIndexType) {
    return isJsonSerializableType(numberIndexType, checker, seenTypes);
  }

  if ((type.flags & ts.TypeFlags.Object) === 0) {
    return false;
  }

  const symbolDeclarations = type.symbol?.getDeclarations();
  if (
    symbolDeclarations?.some((candidate) => ts.isClassDeclaration(candidate))
  ) {
    return false;
  }

  return checker.getPropertiesOfType(type).every((property) => {
    const propertyDeclaration =
      property.valueDeclaration ?? property.getDeclarations()?.[0];

    if (!propertyDeclaration) {
      return false;
    }

    return isJsonSerializableType(
      checker.getTypeOfSymbolAtLocation(property, propertyDeclaration),
      checker,
      seenTypes,
    );
  });
}
