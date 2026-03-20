import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { inflateRawSync } from "node:zlib";

import type { SamlProviderConfig } from "./env.js";

const DEFAULT_BASE_URL = "http://localhost:4000";
export const SAML_TEST_NOW_MS = Date.parse("2026-03-20T12:00:00.000Z");
const SAML_POST_BINDING = "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST";
const SAML_REDIRECT_BINDING =
  "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect";
const SAML_ATTRIBUTE_NAME_FORMAT =
  "urn:oasis:names:tc:SAML:2.0:attrname-format:basic";

const TEST_SAML_PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDBLVcUWK0nek7+
AxNze5aZnlSgsqh3/MoN109BOrj9lcy1MMer220my8fA9QNx+93mDtNm1+4zkqjr
lVApwc7cLjnDMmJ4Onhn0mmwrMxo8Yhs8pE7QhjQU8pXiS4t59ESDGlTdbEZ7wqL
lyBIm+pnDpKn+Ko4g5eIwQuqn82GmZ1r0FoBZ31BH9I2MgtEmKcHLhOkDA0tzi4Z
HNSlBzb0RZuV5ZjLb5rSUtwEuF6vxIE0QORlJ2X54Am9KiiHCKCI0jSgL5onRjGj
S+JfNYN79azmPvNxovUI8qOa6jCbQ+FLAzQ4mrkM05DAhPgDpAbOtaEgfg84fW3X
HQbiRwylAgMBAAECggEAIpdzYe3VJ94TehHj8Eh/ucdr4RDM8Rt/tQXKp+QTjzk9
XG69Oo2C2LEh9nAJa2ZOIG2kNmTRP0PyYqksnyWY3L2cU1NY5a2WtQStL1lqCxrB
Mr0m+4UE+30dnRov/kFmI0S8sZjAG2Q+L6viuI3O5iBqa5CwLomF35Ot+qI+A+17
NhHN06cjfI14wa06CJ/hDqdhBiGorq0SDcwPv+10EuD9uzwOzERFxY1P7mCwKkYg
S+ip+Zq8ockRaJqGls6Kd5W+yKP9GbTBT9qaVfvP0TJxCtBHXXaub8sRP7If2unG
Pt2oOH28+wL9A9wSeoBaD8WSRHa47Xea1zOxtlw7IQKBgQDuy5SLcw72nBlaOs0p
qV2N9Amvs4GU1k3KzpCm13fmO90mbO7cqYbBnlmuHqbwkHhZFx+bIsxOElg7Q8qW
y873AM4HTYUMfZoKEbBscQ1RV1L+raK8hUVHux9xGgXoqwmDc6cl7msXJW09AWGB
tyVJiBBQ+bLJ7EtEk36WU6DPtQKBgQDPGF0kIkd8bnJ5hw8+xyI8m/vVgP2AC7l7
PDD73BVoKc64UiSC3Px4LXAtBaFsqVpYY0Nth8DAygL3C3E8CcDcQePcu6bcjKbi
1Hr8dNAEOWAFre4+Jj+vR1tknaJ3cuRWyAP1HO751NCSh/UtDmIKnYdUJIwhynz/
s5RMR3L/MQKBgAw+I7+ChqHeHu6hVSNtq347pMN9UIdw9UwQixoCsgL7zrrJmvV1
O5Nxqudiauyqe4EVzmkFv7PA/QUM1LYmfNXtFKMLNmcNiXg6r/DfWu9wqrCj9lP0
ATlMPrBtxR/IpRQ4ObmYH6VwJcma6ITd/utmLm/4XVI86x748OSEJRqBAoGAWDha
xR/NMBaksVx1hBq0XPldyE/QrZFRDExR2ZihjePxadekMhMNgexpUuSJJY7nK6vt
d2VTGU11AeRf8mF9RNbUyJ0vsdhA53P4iD8Ctiny27iCOvt0Oai+KBh2s0fAOa+u
7+XJb6fWyfUc3nq4DSmaEqAXCfYGVa8cR3pQZKECgYBuihRiwCJdlH4ojuYuZyll
LUaMH13ZFimQL+OnEcIHxROCPhY6TcxO+DJ3518F5rBIdlDi9X4vs/NDNmcYgp73
PeHh5wFlzWAsTLQuX4L5ebKR0bx4X7Tqc7uzbrsrGj5F4eA5Zbg5vwytUTja44qH
0jEdocq99qiRiR93w2Zw7A==
-----END PRIVATE KEY-----`;

const TEST_SAML_CERT = `-----BEGIN CERTIFICATE-----
MIIDFTCCAf2gAwIBAgIUaFf9+l8pz1bIHcrXB6jW5ivwnkAwDQYJKoZIhvcNAQEL
BQAwGjEYMBYGA1UEAwwPbWRjbXMtc2FtbC10ZXN0MB4XDTI2MDMyMDE5MjUxM1oX
DTM2MDMxNzE5MjUxM1owGjEYMBYGA1UEAwwPbWRjbXMtc2FtbC10ZXN0MIIBIjAN
BgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAwS1XFFitJ3pO/gMTc3uWmZ5UoLKo
d/zKDddPQTq4/ZXMtTDHq9ttJsvHwPUDcfvd5g7TZtfuM5Ko65VQKcHO3C45wzJi
eDp4Z9JpsKzMaPGIbPKRO0IY0FPKV4kuLefREgxpU3WxGe8Ki5cgSJvqZw6Sp/iq
OIOXiMELqp/Nhpmda9BaAWd9QR/SNjILRJinBy4TpAwNLc4uGRzUpQc29EWbleWY
y2+a0lLcBLher8SBNEDkZSdl+eAJvSoohwigiNI0oC+aJ0Yxo0viXzWDe/Ws5j7z
caL1CPKjmuowm0PhSwM0OJq5DNOQwIT4A6QGzrWhIH4POH1t1x0G4kcMpQIDAQAB
o1MwUTAdBgNVHQ4EFgQUebGTuIabO+Lomyc6dmKPFxm9zJQwHwYDVR0jBBgwFoAU
ebGTuIabO+Lomyc6dmKPFxm9zJQwDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0B
AQsFAAOCAQEAUOzqfWdYwNp5XavGAUUzQ1KTz56QEs6ChGTHg82/BZbyar2WWjyp
aw+ImaMgigrxbHlQ9E/kmHY3z4qwx7G00yvqveDLBlQwAgLYFz/E39gUfKCncVCS
iMmXds08F9S0GFBfEQQ1fahGTey1cfJ3KLy1cpWI7kcWP6nWX5DsXDE2AMSOqGhY
KtdNep4wB7u34b598KZypZiRK4cjLsvflGLXupGFGLzw2bRbEHAyQ2QKoD9T8YGR
cpPhp454MWTuf/lkqWIyLYb//IiUXXSzIub/VTNJQVtgFLajEILt+WQ0PkeDGZ4c
I6Pf0dUulNp0HDSadMxrsiznanKRZme8Yg==
-----END CERTIFICATE-----`;

export type SamlResponseFixtureKind =
  | "success"
  | "missing-email"
  | "missing-id"
  | "unsolicited";

export type DecodedSamlSignInRedirect = {
  relayState?: string;
  requestId: string;
  xml: string;
};

export type SamlResponseFixture = {
  RelayState?: string;
  SAMLResponse: string;
  assertionId?: string;
  providerId: string;
  requestId?: string;
  xml: string;
};

type SamlifyModule = {
  IdentityProvider: (props: Record<string, unknown>) => {
    createLoginResponse: (
      sp: unknown,
      requestInfo: Record<string, unknown>,
      binding: string,
      user: Record<string, unknown>,
      customTagReplacement?: (template: string) => { context: string },
    ) => Promise<{ context: string }>;
  };
  SamlLib: {
    attributeStatementBuilder: (
      attributes: Record<string, unknown>[],
      attributeTemplate?: { context: string },
      attributeStatementTemplate?: { context: string },
    ) => string;
    replaceTagsByValue: (
      rawXML: string,
      tagValues: Record<string, unknown>,
    ) => string;
    defaultLoginResponseTemplate: {
      additionalTemplates: Record<string, { context: string }>;
      context: string;
    };
  };
  ServiceProvider: (props: Record<string, unknown>) => unknown;
};

const require = createRequire(import.meta.url);

function loadSamlify(): SamlifyModule {
  const ssoEntry = require.resolve("@better-auth/sso");
  const samlifyEntry = require.resolve("samlify", {
    paths: [resolve(dirname(ssoEntry), "../../..")],
  });
  return require(samlifyEntry) as SamlifyModule;
}

function withFrozenNow<T>(nowMs: number, run: () => Promise<T>): Promise<T> {
  const OriginalDate = Date;

  class FrozenDate extends OriginalDate {
    constructor(value?: string | number | Date) {
      if (value === undefined) {
        super(nowMs);
        return;
      }

      super(value);
    }

    static override now(): number {
      return nowMs;
    }
  }

  FrozenDate.parse = OriginalDate.parse;
  FrozenDate.UTC = OriginalDate.UTC;
  globalThis.Date = FrozenDate as DateConstructor;

  return run().finally(() => {
    globalThis.Date = OriginalDate;
  });
}

function createIdGenerator(seed: string): () => string {
  let index = 0;

  return () => `_${seed}-${index++}`;
}

function createAcsUrl(providerId: string, baseUrl = DEFAULT_BASE_URL): string {
  return new URL(
    `/api/v1/auth/sso/saml2/sp/acs/${providerId}`,
    baseUrl,
  ).toString();
}

function createAttributeDefinitions() {
  return [
    {
      name: "nameID",
      nameFormat: SAML_ATTRIBUTE_NAME_FORMAT,
      valueTag: "subjectId",
      valueXsiType: "xs:string",
    },
    {
      name: "email",
      nameFormat: SAML_ATTRIBUTE_NAME_FORMAT,
      valueTag: "mail",
      valueXsiType: "xs:string",
    },
    {
      name: "displayName",
      nameFormat: SAML_ATTRIBUTE_NAME_FORMAT,
      valueTag: "displayName",
      valueXsiType: "xs:string",
    },
    {
      name: "givenName",
      nameFormat: SAML_ATTRIBUTE_NAME_FORMAT,
      valueTag: "givenName",
      valueXsiType: "xs:string",
    },
    {
      name: "surname",
      nameFormat: SAML_ATTRIBUTE_NAME_FORMAT,
      valueTag: "surname",
      valueXsiType: "xs:string",
    },
  ];
}

function decodeSamlRedirectPayload(value: string): string {
  const buffer = Buffer.from(value, "base64");

  try {
    return inflateRawSync(buffer).toString("utf8");
  } catch {
    return buffer.toString("utf8");
  }
}

function extractXmlAttribute(
  xml: string,
  elementName: string,
  attributeName: string,
): string | undefined {
  const match = xml.match(
    new RegExp(
      `<(?:[A-Za-z0-9_-]+:)?${elementName}\\b[^>]*\\b${attributeName}="([^"]+)"`,
    ),
  );

  return match?.[1];
}

function createFixtureUser(
  kind: SamlResponseFixtureKind,
): Record<string, unknown> {
  if (kind === "missing-email") {
    return {
      email: "",
      mail: "",
      subjectId: "fixture-user-id",
      displayName: "Fixture User",
      givenName: "Fixture",
      surname: "User",
    };
  }

  if (kind === "missing-id") {
    return {
      email: "",
      mail: "fixture-user@example.com",
      subjectId: "",
      displayName: "Fixture User",
      givenName: "Fixture",
      surname: "User",
    };
  }

  return {
    email: "nameid@example.com",
    mail: "fixture-user@example.com",
    subjectId: "fixture-user-id",
    displayName: "Fixture User",
    givenName: "Fixture",
    surname: "User",
  };
}

function sanitizeIdSeed(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildServiceProvider(
  samlify: SamlifyModule,
  providerConfig: SamlProviderConfig,
): unknown {
  return samlify.ServiceProvider({
    entityID: providerConfig.spEntityId ?? providerConfig.issuer,
    authnRequestsSigned: providerConfig.authnRequestsSigned ?? false,
    assertionConsumerService: [
      {
        Binding: SAML_POST_BINDING,
        Location: createAcsUrl(providerConfig.providerId),
      },
    ],
    nameIDFormat: providerConfig.identifierFormat
      ? [providerConfig.identifierFormat]
      : undefined,
    wantAssertionsSigned: providerConfig.wantAssertionsSigned ?? false,
    wantMessageSigned: providerConfig.wantAssertionsSigned ?? false,
  });
}

function buildIdentityProvider(
  samlify: SamlifyModule,
  providerConfig: SamlProviderConfig,
  seed: string,
) {
  return samlify.IdentityProvider({
    entityID: providerConfig.issuer,
    generateID: createIdGenerator(seed),
    loginResponseTemplate: {
      context: samlify.SamlLib.defaultLoginResponseTemplate.context,
      attributes: createAttributeDefinitions(),
      additionalTemplates:
        samlify.SamlLib.defaultLoginResponseTemplate.additionalTemplates,
    },
    nameIDFormat: providerConfig.identifierFormat
      ? [providerConfig.identifierFormat]
      : undefined,
    privateKey: TEST_SAML_PRIVATE_KEY,
    signingCert: providerConfig.cert,
    singleSignOnService: [
      {
        Binding: SAML_REDIRECT_BINDING,
        Location: providerConfig.entryPoint,
      },
    ],
    wantAuthnRequestsSigned: false,
  });
}

function createLoginResponseTemplateReplacement(
  samlify: SamlifyModule,
  providerConfig: SamlProviderConfig,
  seed: string,
  user: Record<string, unknown>,
  requestId?: string,
): (template: string) => { context: string } {
  return (template: string) => {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);
    const acsUrl = createAcsUrl(providerConfig.providerId);
    const entityId = providerConfig.spEntityId ?? providerConfig.issuer;
    const additionalTemplates =
      samlify.SamlLib.defaultLoginResponseTemplate.additionalTemplates;
    const attributeStatement = samlify.SamlLib.attributeStatementBuilder(
      createAttributeDefinitions(),
      additionalTemplates.attributeTemplate,
      additionalTemplates.attributeStatementTemplate,
    );

    return {
      context: samlify.SamlLib.replaceTagsByValue(template, {
        ID: `_${seed}-0`,
        AssertionID: `_${seed}-1`,
        Destination: acsUrl,
        Audience: entityId,
        EntityID: entityId,
        SubjectRecipient: acsUrl,
        Issuer: providerConfig.issuer,
        IssueInstant: now.toISOString(),
        AssertionConsumerServiceURL: acsUrl,
        StatusCode: "urn:oasis:names:tc:SAML:2.0:status:Success",
        ConditionsNotBefore: now.toISOString(),
        ConditionsNotOnOrAfter: expiresAt.toISOString(),
        SubjectConfirmationDataNotOnOrAfter: expiresAt.toISOString(),
        NameIDFormat: providerConfig.identifierFormat ?? "",
        NameID: String(user.subjectId ?? ""),
        InResponseTo: requestId ?? "",
        AuthnStatement: "",
        AttributeStatement: attributeStatement,
        attrSubjectId: String(user.subjectId ?? ""),
        attrMail: String(user.mail ?? ""),
        attrDisplayName: String(user.displayName ?? ""),
        attrGivenName: String(user.givenName ?? ""),
        attrSurname: String(user.surname ?? ""),
      }),
    };
  };
}

export function createSamlProviderConfig(
  overrides: Partial<SamlProviderConfig> = {},
): SamlProviderConfig {
  const defaultConfig: SamlProviderConfig = {
    providerId: "okta-saml",
    issuer: "https://www.okta.com/exk123456789",
    domain: "example.com",
    entryPoint: "https://example.okta.com/app/example/sso/saml",
    cert: TEST_SAML_CERT,
    audience: "https://cms.example.com/saml/okta-saml/sp",
    spEntityId: "https://cms.example.com/saml/okta-saml/sp",
    identifierFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
    authnRequestsSigned: false,
    wantAssertionsSigned: true,
    attributeMapping: {
      id: "nameID",
      email: "email",
      name: "displayName",
      firstName: "givenName",
      lastName: "surname",
    },
  };

  return {
    ...defaultConfig,
    ...overrides,
    attributeMapping: {
      ...defaultConfig.attributeMapping,
      ...overrides.attributeMapping,
    },
  };
}

export function createSamlEnv(
  baseEnv: NodeJS.ProcessEnv,
  overrides: Partial<SamlProviderConfig> = {},
): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    MDCMS_SERVER_URL: baseEnv.MDCMS_SERVER_URL ?? DEFAULT_BASE_URL,
    MDCMS_AUTH_SAML_PROVIDERS: JSON.stringify([
      createSamlProviderConfig(overrides),
    ]),
  };
}

export function decodeSamlSignInRedirect(
  location: string,
): DecodedSamlSignInRedirect {
  const url = new URL(location);
  const samlRequest = url.searchParams.get("SAMLRequest");

  if (!samlRequest) {
    throw new Error("SAML sign-in redirect is missing SAMLRequest.");
  }

  const xml = decodeSamlRedirectPayload(samlRequest);
  const requestId = extractXmlAttribute(xml, "AuthnRequest", "ID");

  if (!requestId) {
    throw new Error(
      "SAML sign-in redirect does not contain an AuthnRequest ID.",
    );
  }

  return {
    relayState: url.searchParams.get("RelayState") ?? undefined,
    requestId,
    xml,
  };
}

export async function createSamlResponseFixture(input: {
  kind: SamlResponseFixtureKind;
  nowMs?: number;
  providerConfig?: Partial<SamlProviderConfig>;
  relayState?: string;
  requestId?: string;
}): Promise<SamlResponseFixture> {
  const providerConfig = createSamlProviderConfig(input.providerConfig);
  const samlify = loadSamlify();
  const sp = buildServiceProvider(samlify, providerConfig);
  const idSeed = sanitizeIdSeed(
    `${input.kind}-${input.requestId ?? "unsolicited"}`,
  );
  const idp = buildIdentityProvider(samlify, providerConfig, idSeed);
  const user = createFixtureUser(input.kind);
  const requestInfo = {
    extract: {
      request: {
        id: input.kind === "unsolicited" ? "" : (input.requestId ?? ""),
      },
    },
  };

  const response = await withFrozenNow(input.nowMs ?? SAML_TEST_NOW_MS, () =>
    idp.createLoginResponse(
      sp,
      requestInfo,
      "post",
      user,
      createLoginResponseTemplateReplacement(
        samlify,
        providerConfig,
        idSeed,
        user,
        input.kind === "unsolicited" ? undefined : input.requestId,
      ),
    ),
  );
  const xml = Buffer.from(response.context, "base64").toString("utf8");

  return {
    RelayState: input.relayState,
    SAMLResponse: response.context,
    assertionId: extractXmlAttribute(xml, "Assertion", "ID"),
    providerId: providerConfig.providerId,
    requestId: input.requestId,
    xml,
  };
}
