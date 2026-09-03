// src/host/routes.ts
import { randomUUID as randomUUID3 } from "node:crypto";
import { BlockList as BlockList3, isIP as isIP3 } from "node:net";
import z from "@deepseek-ai/schemastery";

// src/contracts/errors.ts
var CatalogContractError = class extends Error {
  contract;
  issues;
  constructor(contract, issues) {
    super(`${contract} contract rejected: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "CatalogContractError";
    this.contract = contract;
    this.issues = issues;
  }
};
function schemaIssues(errors) {
  if (!errors?.length) {
    return [{ path: "/", message: "is invalid", keyword: "validation" }];
  }
  return errors.map((error) => ({
    path: error.instancePath || "/",
    message: error.message ?? "is invalid",
    keyword: error.keyword
  }));
}
function semanticIssue(path, message) {
  return { path, message, keyword: "semantic" };
}

// src/contracts/identity.ts
function normalizeSubdirectory(value) {
  if (value.startsWith("/") || value.endsWith("/") || value.includes("\\")) {
    throw new CatalogContractError("identity", [
      semanticIssue("/repository/subdirectory", "must be a relative POSIX path")
    ]);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new CatalogContractError("identity", [
      semanticIssue("/repository/subdirectory", "must not contain empty, dot, or parent segments")
    ]);
  }
  for (const segment of segments) {
    let decoded;
    try {
      decoded = decodeURIComponent(segment);
    } catch {
      throw new CatalogContractError("identity", [
        semanticIssue("/repository/subdirectory", "contains invalid percent encoding")
      ]);
    }
    if (decoded.includes("/") || decoded.includes("\\") || decoded === "." || decoded === "..") {
      throw new CatalogContractError("identity", [
        semanticIssue("/repository/subdirectory", "contains an encoded path separator or dot segment")
      ]);
    }
  }
  return segments.join("/");
}
function normalizeRepositoryIdentity(repository) {
  let url;
  try {
    url = new URL(repository.url);
  } catch {
    throw new CatalogContractError("identity", [semanticIssue("/repository/url", "must be an absolute URL")]);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new CatalogContractError("identity", [
      semanticIssue("/repository/url", "must be credential-free HTTPS without query or fragment")
    ]);
  }
  const pathSegments = url.pathname.split("/").filter(Boolean);
  if (pathSegments.length === 0) {
    throw new CatalogContractError("identity", [
      semanticIssue("/repository/url", "must identify a repository path")
    ]);
  }
  let path = `/${pathSegments.join("/")}`.replace(/\.git$/iu, "");
  if (url.hostname === "github.com") {
    if (pathSegments.length !== 2) {
      throw new CatalogContractError("identity", [
        semanticIssue("/repository/url", "GitHub repository URLs must contain exactly owner and repository")
      ]);
    }
    path = `/${pathSegments.map((segment) => segment.toLowerCase()).join("/")}`.replace(/\.git$/u, "");
  }
  url.pathname = path;
  const normalized = { url: url.toString().replace(/\/$/u, "") };
  if (repository.subdirectory !== void 0) {
    return { ...normalized, subdirectory: normalizeSubdirectory(repository.subdirectory) };
  }
  return normalized;
}
function normalizePackageIdentity(packageIdentity) {
  return { registry: "npm", name: packageIdentity.name };
}
function catalogIdentityChoices(item) {
  const choices = [];
  if (item.package) {
    choices.push({ kind: "package", package: normalizePackageIdentity(item.package) });
  }
  if (item.repository) {
    choices.push({ kind: "repository", repository: normalizeRepositoryIdentity(item.repository) });
  }
  return choices;
}

// docs/schemas/catalog-source.schema.json
var catalog_source_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:dsh-community-market:schema:catalog-source:1.0.0",
  title: "DSH Community Market catalog source manifest",
  description: "A provider-neutral declaration for one user-selectable HTTPS JSON catalog endpoint. A user registers its manifest URL; selection and all other user-owned state stay local. The smallest recommended profile supports q, category, cursor, and limit and uses 50 as an example page size, not a global cap.",
  type: "object",
  additionalProperties: false,
  required: [
    "manifestVersion",
    "providerId",
    "name",
    "attribution",
    "transport",
    "query"
  ],
  properties: {
    manifestVersion: {
      const: "1.0.0"
    },
    providerId: {
      type: "string",
      minLength: 3,
      maxLength: 128,
      pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)+$",
      description: "Provider-claimed stable identifier, preferably in reverse-domain form. The Host generates a separate sourceRecordId for local identity."
    },
    name: {
      type: "string",
      minLength: 1,
      maxLength: 120,
      pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]*$"
    },
    description: {
      type: "string",
      maxLength: 500,
      pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]*$"
    },
    homepage: {
      type: "string",
      format: "uri",
      maxLength: 2048,
      pattern: "^https://(?![^/?#]*@)(?![^/?#]*:)[^#]+$"
    },
    attribution: {
      type: "object",
      additionalProperties: false,
      required: [
        "name",
        "url"
      ],
      properties: {
        name: {
          type: "string",
          minLength: 1,
          maxLength: 120,
          pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]*$"
        },
        url: {
          type: "string",
          format: "uri",
          maxLength: 2048,
          pattern: "^https://(?![^/?#]*@)(?![^/?#]*:)[^#]+$"
        },
        notice: {
          type: "string",
          maxLength: 500,
          pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]*$"
        }
      }
    },
    transport: {
      type: "object",
      additionalProperties: false,
      required: [
        "kind",
        "endpoint",
        "method"
      ],
      properties: {
        kind: {
          const: "https-json"
        },
        endpoint: {
          type: "string",
          format: "uri",
          maxLength: 2048,
          pattern: "^https://(?![^/?#]*@)(?![^/?#]*:)[^/?#\\s]+(?:/[^?#\\s]*)?/v1/plugins$",
          description: "Absolute HTTPS endpoint on standard port 443 with no query or fragment. It must share the user-approved manifest origin, and the standard endpoint path ends in /v1/plugins."
        },
        method: {
          const: "GET"
        }
      }
    },
    query: {
      type: "object",
      description: "The endpoint query features advertised by this source. The minimal fixture uses supported=[q, category, cursor, limit], defaultLimit=50, maxLimit=50, and sorts=[]. Standard sources may declare limits through the Schema maximum of 100.",
      additionalProperties: false,
      required: [
        "supported",
        "defaultLimit",
        "maxLimit",
        "sorts"
      ],
      properties: {
        supported: {
          type: "array",
          minItems: 0,
          maxItems: 7,
          uniqueItems: true,
          items: {
            enum: [
              "q",
              "category",
              "capability",
              "cursor",
              "limit",
              "sort",
              "locale"
            ]
          }
        },
        defaultLimit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 50
        },
        maxLimit: {
          type: "integer",
          minimum: 1,
          maximum: 100,
          default: 50
        },
        sorts: {
          type: "array",
          maxItems: 4,
          uniqueItems: true,
          items: {
            enum: [
              "relevance",
              "updated",
              "name",
              "downloads"
            ]
          }
        }
      }
    }
  }
};

// docs/schemas/catalog-query.schema.json
var catalog_query_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:dsh-community-market:schema:catalog-query:1.0.0",
  title: "DSH Community Market normalized catalog query",
  description: "The normalized query accepted by the currently selected catalog adapter. The standard HTTPS endpoint encodes category and capability values as repeated parameters; repeated category values use OR semantics. The current UI defaults limit to 50, while the contract permits values through 100.",
  type: "object",
  additionalProperties: false,
  properties: {
    q: {
      type: "string",
      minLength: 1,
      maxLength: 200,
      pattern: "^\\S(?:[\\s\\S]*\\S)?$"
    },
    category: {
      type: "array",
      description: "A multi-select OR filter: an item matches when it belongs to any requested category.",
      maxItems: 20,
      uniqueItems: true,
      items: {
        $ref: "#/$defs/categoryId"
      }
    },
    capability: {
      type: "array",
      maxItems: 32,
      uniqueItems: true,
      items: {
        $ref: "#/$defs/capabilityId"
      }
    },
    cursor: {
      type: "string",
      minLength: 1,
      maxLength: 2048
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 100,
      default: 50
    },
    sort: {
      enum: [
        "relevance",
        "updated",
        "name",
        "downloads"
      ],
      default: "relevance"
    },
    locale: {
      type: "string",
      minLength: 2,
      maxLength: 35,
      pattern: "^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$",
      description: "A BCP 47-like language tag."
    }
  },
  $defs: {
    categoryId: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9][a-z0-9._:-]*$"
    },
    capabilityId: {
      type: "string",
      minLength: 3,
      maxLength: 96,
      pattern: "^[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)+$"
    }
  }
};

// docs/schemas/catalog-provider-page.schema.json
var catalog_provider_page_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:dsh-community-market:schema:catalog-provider-page:1.0.0",
  title: "DSH Community Market standard provider page",
  description: "The untrusted page JSON returned by one standard HTTPS catalog endpoint. Only schemaVersion, items, and page are required. A page may contain at most 100 items and must also respect the effective requested or declared default limit. Host-observed provenance is intentionally absent and is injected only after validation.",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "items",
    "page"
  ],
  properties: {
    schemaVersion: {
      const: "1.0.0"
    },
    generatedAt: {
      type: "string",
      format: "date-time"
    },
    revision: {
      type: "string",
      minLength: 1,
      maxLength: 160
    },
    items: {
      type: "array",
      maxItems: 100,
      items: {
        $ref: "#/$defs/item"
      }
    },
    page: {
      $ref: "#/$defs/page"
    }
  },
  $defs: {
    identifier: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
    },
    httpsUri: {
      type: "string",
      format: "uri",
      maxLength: 2048,
      pattern: "^https://(?![^/?#]*@)(?![^/?#]*:)[^#]+$"
    },
    plainText: {
      type: "string",
      pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]*$"
    },
    mediaAlt: {
      allOf: [
        {
          $ref: "#/$defs/plainText"
        },
        {
          type: "string",
          minLength: 1,
          maxLength: 240
        }
      ]
    },
    remoteIconCandidate: {
      type: "object",
      description: "A provider-declared remote plugin-icon candidate. The URL must share the final provider-page response origin. The Host resolves and validates it before it can enter a normalized snapshot; the Renderer never receives this URL.",
      additionalProperties: false,
      required: [
        "url"
      ],
      properties: {
        url: {
          $ref: "#/$defs/httpsUri"
        },
        alt: {
          $ref: "#/$defs/mediaAlt"
        }
      }
    },
    media: {
      type: "object",
      description: "Optional provider-declared plugin media. In v1, only a direct plugin icon is standardized.",
      additionalProperties: false,
      required: [
        "icon"
      ],
      properties: {
        icon: {
          $ref: "#/$defs/remoteIconCandidate"
        }
      }
    },
    page: {
      type: "object",
      description: "Use an empty object when there is no next page. nextCursor is opaque and belongs only to this source and effective query.",
      additionalProperties: false,
      properties: {
        nextCursor: {
          type: "string",
          minLength: 1,
          maxLength: 2048
        },
        total: {
          type: "integer",
          minimum: 0
        }
      }
    },
    repository: {
      type: "object",
      additionalProperties: false,
      required: [
        "url"
      ],
      properties: {
        url: {
          $ref: "#/$defs/httpsUri"
        },
        subdirectory: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^\\\\]+$"
        }
      }
    },
    package: {
      type: "object",
      additionalProperties: false,
      required: [
        "registry",
        "name"
      ],
      properties: {
        registry: {
          const: "npm"
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: 214,
          pattern: "^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$"
        }
      }
    },
    publisher: {
      type: "object",
      additionalProperties: false,
      required: [
        "name"
      ],
      properties: {
        name: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 120
            }
          ]
        },
        url: {
          $ref: "#/$defs/httpsUri"
        }
      }
    },
    capabilityList: {
      type: "array",
      maxItems: 64,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 96,
        pattern: "^[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)+$"
      }
    },
    categoryId: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9][a-z0-9._:-]*$"
    },
    capabilities: {
      type: "object",
      additionalProperties: false,
      properties: {
        required: {
          $ref: "#/$defs/capabilityList"
        },
        optional: {
          $ref: "#/$defs/capabilityList"
        }
      }
    },
    compatibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiVersion: {
          type: "string",
          minLength: 1,
          maxLength: 64
        },
        hosts: {
          type: "array",
          maxItems: 32,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 96
          }
        }
      }
    },
    item: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "name",
        "displayName",
        "summary"
      ],
      properties: {
        id: {
          $ref: "#/$defs/identifier"
        },
        name: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 160
            }
          ]
        },
        displayName: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 120
            }
          ]
        },
        summary: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 1e3
            }
          ]
        },
        description: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              maxLength: 5e3
            }
          ]
        },
        homepage: {
          $ref: "#/$defs/httpsUri"
        },
        latestVersion: {
          type: "string",
          minLength: 1,
          maxLength: 64
        },
        license: {
          type: "string",
          minLength: 1,
          maxLength: 80
        },
        categories: {
          type: "array",
          maxItems: 32,
          uniqueItems: true,
          items: {
            $ref: "#/$defs/categoryId"
          }
        },
        keywords: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 64
          }
        },
        repository: {
          $ref: "#/$defs/repository"
        },
        package: {
          $ref: "#/$defs/package"
        },
        publisher: {
          $ref: "#/$defs/publisher"
        },
        media: {
          $ref: "#/$defs/media"
        },
        capabilities: {
          $ref: "#/$defs/capabilities"
        },
        compatibility: {
          $ref: "#/$defs/compatibility"
        },
        updatedAt: {
          type: "string",
          format: "date-time"
        }
      },
      anyOf: [
        {
          properties: {
            repository: true
          },
          required: [
            "repository"
          ]
        },
        {
          properties: {
            package: true
          },
          required: [
            "package"
          ]
        }
      ]
    }
  }
};

// docs/schemas/catalog-snapshot.schema.json
var catalog_snapshot_schema_default = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "urn:dsh-community-market:schema:catalog-snapshot:1.0.0",
  title: "DSH Community Market normalized catalog snapshot",
  description: "A normalized, non-executable page produced locally by a catalog adapter. Host-observed provenance is retained for every item.",
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "source",
    "items",
    "page"
  ],
  properties: {
    schemaVersion: {
      const: "1.0.0"
    },
    source: {
      $ref: "#/$defs/source"
    },
    items: {
      type: "array",
      maxItems: 100,
      items: {
        $ref: "#/$defs/item"
      }
    },
    page: {
      $ref: "#/$defs/page"
    }
  },
  $defs: {
    providerId: {
      type: "string",
      minLength: 3,
      maxLength: 128,
      pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)+$"
    },
    sourceRecordId: {
      type: "string",
      format: "uuid",
      description: "Opaque local registration identity generated by the Host, never supplied by a provider."
    },
    identifier: {
      type: "string",
      minLength: 1,
      maxLength: 160,
      pattern: "^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$"
    },
    httpsUri: {
      type: "string",
      format: "uri",
      maxLength: 2048,
      pattern: "^https://(?![^/?#]*@)(?![^/?#]*:)[^#]+$"
    },
    plainText: {
      type: "string",
      pattern: "^[^\\u0000-\\u001F\\u007F-\\u009F\\u202A-\\u202E\\u2066-\\u2069]*$"
    },
    mediaAlt: {
      allOf: [
        {
          $ref: "#/$defs/plainText"
        },
        {
          type: "string",
          minLength: 1,
          maxLength: 240
        }
      ]
    },
    assetRef: {
      type: "string",
      description: "An opaque Host-managed media reference. It is neither a remote URL nor a filesystem path and is the only media locator exposed to the Renderer.",
      minLength: 39,
      maxLength: 39,
      pattern: "^mktimg_[A-Za-z0-9_-]{32}$"
    },
    resolvedIcon: {
      type: "object",
      description: "A Host-resolved icon safe for Renderer consumption. The role distinguishes a plugin-owned icon from a publisher-avatar fallback.",
      additionalProperties: false,
      required: [
        "assetRef",
        "role"
      ],
      properties: {
        assetRef: {
          $ref: "#/$defs/assetRef"
        },
        role: {
          enum: [
            "plugin-icon",
            "publisher-avatar"
          ]
        },
        alt: {
          $ref: "#/$defs/mediaAlt"
        }
      }
    },
    media: {
      type: "object",
      description: "Optional Host-resolved plugin media. Version 1 standardizes only the icon slot.",
      additionalProperties: false,
      required: [
        "icon"
      ],
      properties: {
        icon: {
          $ref: "#/$defs/resolvedIcon"
        }
      }
    },
    source: {
      type: "object",
      additionalProperties: false,
      required: [
        "sourceRecordId",
        "providerId",
        "adapterId",
        "registrationKind",
        "fetchedAt",
        "finalUrl"
      ],
      properties: {
        sourceRecordId: {
          $ref: "#/$defs/sourceRecordId"
        },
        providerId: {
          $ref: "#/$defs/providerId"
        },
        adapterId: {
          type: "string",
          minLength: 1,
          maxLength: 96,
          pattern: "^[a-z0-9]+(?:[.-][a-z0-9]+)+$"
        },
        registrationKind: {
          enum: [
            "user-added",
            "built-in"
          ]
        },
        fetchedAt: {
          type: "string",
          format: "date-time"
        },
        finalUrl: {
          $ref: "#/$defs/httpsUri"
        },
        providerGeneratedAt: {
          type: "string",
          format: "date-time"
        },
        providerRevision: {
          type: "string",
          minLength: 1,
          maxLength: 160
        }
      }
    },
    page: {
      type: "object",
      additionalProperties: false,
      properties: {
        nextCursor: {
          type: "string",
          minLength: 1,
          maxLength: 2048
        },
        total: {
          type: "integer",
          minimum: 0
        }
      }
    },
    provenance: {
      type: "object",
      additionalProperties: false,
      required: [
        "sourceRecordId",
        "providerId",
        "itemId"
      ],
      properties: {
        sourceRecordId: {
          $ref: "#/$defs/sourceRecordId"
        },
        providerId: {
          $ref: "#/$defs/providerId"
        },
        itemId: {
          $ref: "#/$defs/identifier"
        }
      }
    },
    repository: {
      type: "object",
      additionalProperties: false,
      required: [
        "url"
      ],
      properties: {
        url: {
          $ref: "#/$defs/httpsUri"
        },
        subdirectory: {
          type: "string",
          minLength: 1,
          maxLength: 240,
          pattern: "^(?!/)(?!.*(?:^|/)\\.\\.(?:/|$))[^\\\\]+$"
        }
      }
    },
    package: {
      type: "object",
      additionalProperties: false,
      required: [
        "registry",
        "name"
      ],
      properties: {
        registry: {
          const: "npm"
        },
        name: {
          type: "string",
          minLength: 1,
          maxLength: 214,
          pattern: "^(?:@[a-z0-9][a-z0-9._-]*/)?[a-z0-9][a-z0-9._-]*$"
        }
      }
    },
    publisher: {
      type: "object",
      additionalProperties: false,
      required: [
        "name"
      ],
      properties: {
        name: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 120
            }
          ]
        },
        url: {
          $ref: "#/$defs/httpsUri"
        }
      }
    },
    capabilities: {
      type: "object",
      additionalProperties: false,
      properties: {
        required: {
          $ref: "#/$defs/capabilityList"
        },
        optional: {
          $ref: "#/$defs/capabilityList"
        }
      }
    },
    capabilityList: {
      type: "array",
      maxItems: 64,
      uniqueItems: true,
      items: {
        type: "string",
        minLength: 1,
        maxLength: 96,
        pattern: "^[a-z][a-z0-9-]*(?:\\.[a-z][a-z0-9-]*)+$"
      }
    },
    categoryId: {
      type: "string",
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9][a-z0-9._:-]*$"
    },
    compatibility: {
      type: "object",
      additionalProperties: false,
      properties: {
        apiVersion: {
          type: "string",
          minLength: 1,
          maxLength: 64
        },
        hosts: {
          type: "array",
          maxItems: 32,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 96
          }
        }
      }
    },
    item: {
      type: "object",
      additionalProperties: false,
      required: [
        "id",
        "name",
        "displayName",
        "summary",
        "provenance"
      ],
      properties: {
        id: {
          $ref: "#/$defs/identifier"
        },
        name: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 160
            }
          ]
        },
        displayName: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 120
            }
          ]
        },
        summary: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              minLength: 1,
              maxLength: 1e3
            }
          ]
        },
        description: {
          allOf: [
            {
              $ref: "#/$defs/plainText"
            },
            {
              type: "string",
              maxLength: 5e3
            }
          ]
        },
        homepage: {
          $ref: "#/$defs/httpsUri"
        },
        latestVersion: {
          type: "string",
          minLength: 1,
          maxLength: 64
        },
        license: {
          type: "string",
          minLength: 1,
          maxLength: 80
        },
        categories: {
          type: "array",
          maxItems: 32,
          uniqueItems: true,
          items: {
            $ref: "#/$defs/categoryId"
          }
        },
        keywords: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: {
            type: "string",
            minLength: 1,
            maxLength: 64
          }
        },
        repository: {
          $ref: "#/$defs/repository"
        },
        package: {
          $ref: "#/$defs/package"
        },
        publisher: {
          $ref: "#/$defs/publisher"
        },
        media: {
          $ref: "#/$defs/media"
        },
        capabilities: {
          $ref: "#/$defs/capabilities"
        },
        compatibility: {
          $ref: "#/$defs/compatibility"
        },
        updatedAt: {
          type: "string",
          format: "date-time"
        },
        provenance: {
          $ref: "#/$defs/provenance"
        }
      },
      anyOf: [
        {
          properties: {
            repository: true
          },
          required: [
            "repository"
          ]
        },
        {
          properties: {
            package: true
          },
          required: [
            "package"
          ]
        }
      ]
    }
  }
};

// src/contracts/schemas.ts
import { createRequire } from "node:module";
import { Ajv2020 } from "ajv/dist/2020.js";
var schemas = {
  "catalog-source": catalog_source_schema_default,
  "catalog-query": catalog_query_schema_default,
  "catalog-provider-page": catalog_provider_page_schema_default,
  "catalog-snapshot": catalog_snapshot_schema_default
};
function readSchema(name2) {
  return schemas[name2];
}
var ajv = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: true
});
var require2 = createRequire(import.meta.url);
var addFormats = require2("ajv-formats");
addFormats(ajv);
var validators = {
  source: ajv.compile(readSchema("catalog-source")),
  query: ajv.compile(readSchema("catalog-query")),
  providerPage: ajv.compile(readSchema("catalog-provider-page")),
  snapshot: ajv.compile(readSchema("catalog-snapshot"))
};

// src/contracts/validate.ts
function parseSchema(contract, validate, value) {
  if (!validate(value)) {
    throw new CatalogContractError(contract, schemaIssues(validate.errors));
  }
  return value;
}
function parseCatalogSource(value) {
  const source = parseSchema("source", validators.source, value);
  const issues = [];
  const endpoint = new URL(source.transport.endpoint);
  if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.port || endpoint.search || endpoint.hash || !endpoint.pathname.endsWith("/v1/plugins")) {
    issues.push(semanticIssue("/transport/endpoint", "must use credential-free HTTPS on standard port 443 without query or fragment and end in /v1/plugins"));
  }
  if (source.query.defaultLimit > source.query.maxLimit) {
    issues.push(semanticIssue("/query/defaultLimit", "must not exceed maxLimit"));
  }
  if (source.query.supported.includes("sort") && source.query.sorts.length === 0) {
    issues.push(semanticIssue("/query/sorts", "must not be empty when sort is supported"));
  }
  if (!source.query.supported.includes("sort") && source.query.sorts.length > 0) {
    issues.push(semanticIssue("/query/sorts", "must be empty when sort is not supported"));
  }
  if (issues.length) throw new CatalogContractError("source", issues);
  return source;
}
function parseCatalogQuery(value) {
  return parseSchema("query", validators.query, value);
}
function parseCatalogProviderPage(value, effectiveLimit) {
  const page = parseSchema("provider-page", validators.providerPage, value);
  const seen = /* @__PURE__ */ new Set();
  if (effectiveLimit !== void 0) {
    if (!Number.isInteger(effectiveLimit) || effectiveLimit < 1 || effectiveLimit > 100) {
      throw new CatalogContractError("provider-page", [
        semanticIssue("/items", "cannot be checked against an invalid effective query limit")
      ]);
    }
    if (page.items.length > effectiveLimit) {
      throw new CatalogContractError("provider-page", [
        semanticIssue("/items", `contains more than the effective query limit of ${effectiveLimit}`)
      ]);
    }
  }
  for (const [index, item] of page.items.entries()) {
    if (seen.has(item.id)) {
      throw new CatalogContractError("provider-page", [
        semanticIssue(`/items/${index}/id`, `duplicates provider item ID ${item.id}`)
      ]);
    }
    seen.add(item.id);
    if (item.repository) normalizeRepositoryIdentity(item.repository);
  }
  return page;
}
function parseCatalogSnapshot(value) {
  const snapshot = parseSchema("snapshot", validators.snapshot, value);
  const seen = /* @__PURE__ */ new Set();
  for (const [index, item] of snapshot.items.entries()) {
    const path = `/items/${index}`;
    if (item.provenance.sourceRecordId !== snapshot.source.sourceRecordId || item.provenance.providerId !== snapshot.source.providerId || item.provenance.itemId !== item.id) {
      throw new CatalogContractError("snapshot", [
        semanticIssue(`${path}/provenance`, "must match the snapshot source and item ID")
      ]);
    }
    const identity2 = `${item.provenance.sourceRecordId}\0${item.provenance.itemId}`;
    if (seen.has(identity2)) {
      throw new CatalogContractError("snapshot", [
        semanticIssue(`${path}/provenance`, "duplicates a normalized source/item identity")
      ]);
    }
    seen.add(identity2);
    if (item.repository) normalizeRepositoryIdentity(item.repository);
  }
  return snapshot;
}
function validateLocalSourceRecords(records) {
  const ids = /* @__PURE__ */ new Set();
  const orders = /* @__PURE__ */ new Set();
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
  const providerIdPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/u;
  const adapterIdPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)+$/u;
  const builtInKeyPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;
  for (const [index, record3] of records.entries()) {
    const hasManifest = record3.manifestUrl !== void 0;
    const hasBuiltIn = record3.builtInProviderKey !== void 0;
    if (hasManifest === hasBuiltIn) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}`, "must contain exactly one of manifestUrl or builtInProviderKey")
      ]);
    }
    if (record3.registrationKind === "user-added" && !hasManifest) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/manifestUrl`, "is required for a user-added source")
      ]);
    }
    if (record3.registrationKind === "user-added" && record3.manifest === void 0) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/manifest`, "is required for a user-added standard source")
      ]);
    }
    if (record3.registrationKind === "built-in" && !hasBuiltIn) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/builtInProviderKey`, "is required for a built-in source")
      ]);
    }
    if (record3.registrationKind === "built-in" && record3.manifest !== void 0) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/manifest`, "is reserved for user-added standard sources")
      ]);
    }
    if (!uuidPattern.test(record3.sourceRecordId)) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/sourceRecordId`, "must be a UUID generated by the Host")
      ]);
    }
    if (!providerIdPattern.test(record3.providerId)) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/providerId`, "is not a valid provider claim")
      ]);
    }
    if (!adapterIdPattern.test(record3.adapterId)) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/adapterId`, "is not a valid local adapter identity")
      ]);
    }
    if (record3.builtInProviderKey !== void 0 && !builtInKeyPattern.test(record3.builtInProviderKey)) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/builtInProviderKey`, "is not a valid built-in provider key")
      ]);
    }
    if (record3.manifestUrl !== void 0) {
      let manifestUrl;
      try {
        manifestUrl = new URL(record3.manifestUrl);
      } catch {
        throw new CatalogContractError("local-source", [
          semanticIssue(`/${index}/manifestUrl`, "must be an absolute URL")
        ]);
      }
      if (manifestUrl.protocol !== "https:" || manifestUrl.username || manifestUrl.password || manifestUrl.port || manifestUrl.search || manifestUrl.hash) {
        throw new CatalogContractError("local-source", [
          semanticIssue(`/${index}/manifestUrl`, "must use credential-free HTTPS on standard port 443 without query or fragment")
        ]);
      }
      const manifest = parseCatalogSource(record3.manifest);
      if (manifest.providerId !== record3.providerId) {
        throw new CatalogContractError("local-source", [
          semanticIssue(`/${index}/manifest/providerId`, "must match the pinned provider claim")
        ]);
      }
      if (new URL(manifest.transport.endpoint).origin !== manifestUrl.origin) {
        throw new CatalogContractError("local-source", [
          semanticIssue(`/${index}/manifest/transport/endpoint`, "must match the registered manifest origin")
        ]);
      }
    }
    if (!Number.isInteger(record3.order) || record3.order < 0) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/order`, "must be a non-negative integer")
      ]);
    }
    if (ids.has(record3.sourceRecordId)) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/sourceRecordId`, "duplicates a local source identity")
      ]);
    }
    ids.add(record3.sourceRecordId);
    if (orders.has(record3.order)) {
      throw new CatalogContractError("local-source", [
        semanticIssue(`/${index}/order`, "duplicates a local source order")
      ]);
    }
    orders.add(record3.order);
  }
}

// src/network/restricted-http.ts
import dns from "node:dns";
import { BlockList, isIP } from "node:net";
import https from "node:https";
var MAX_REDIRECTS = 3;
var MAX_BODY_BYTES = 2 * 1024 * 1024;
var CONNECT_TIMEOUT_MS = 8e3;
var FIRST_BYTE_TIMEOUT_MS = 12e3;
var TOTAL_TIMEOUT_MS = 3e4;
var SYNTHETIC_PROXY_NETWORK = "198.18.0.0";
var SYNTHETIC_PROXY_PREFIX = 15;
var CatalogNetworkError = class extends Error {
  constructor(code) {
    super(`catalog request failed: ${code}`);
    this.code = code;
    this.name = "CatalogNetworkError";
  }
};
var blockedAddresses = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3]
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
]) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}
var syntheticProxyAddresses = new BlockList();
syntheticProxyAddresses.addSubnet(SYNTHETIC_PROXY_NETWORK, SYNTHETIC_PROXY_PREFIX, "ipv4");
function assertSafeAddress(address, allowSyntheticProxyAddress = false) {
  const normalized = address.replace(/^\[|\]$/gu, "").split("%", 1)[0];
  const family = isIP(normalized);
  const addressFamily = family === 4 ? "ipv4" : "ipv6";
  const allowedSyntheticAddress = allowSyntheticProxyAddress && family === 4 && syntheticProxyAddresses.check(normalized, "ipv4");
  if (family === 0 || blockedAddresses.check(normalized, addressFamily) && !allowedSyntheticAddress) {
    throw new CatalogNetworkError("blocked-address");
  }
  return family;
}
function pinnedLookupResult(options, pinned) {
  return options.all ? [pinned] : pinned;
}
function validateUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CatalogNetworkError("invalid-url");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443") {
    throw new CatalogNetworkError("invalid-url");
  }
  return url;
}
function readBody(response, maxBodyBytes) {
  return new Promise((resolve3, reject) => {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBodyBytes) {
        response.destroy(new CatalogNetworkError("response"));
        return;
      }
      chunks.push(buffer);
    });
    response.once("end", () => resolve3(Buffer.concat(chunks)));
    response.once("error", reject);
  });
}
async function defaultLookupAddresses(hostname) {
  const entries = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return entries.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4
  }));
}
async function resolvePinnedAddress(hostname, lookupAddresses, syntheticProxyHostnames) {
  const literal = hostname.replace(/^\[|\]$/gu, "");
  if (isIP(literal)) return { address: literal, family: assertSafeAddress(literal) };
  const addresses = await lookupAddresses(hostname);
  if (addresses.length === 0) throw new CatalogNetworkError("blocked-address");
  const allowSyntheticProxyAddress = syntheticProxyHostnames.has(hostname.toLowerCase());
  for (const entry of addresses) {
    if (entry.family !== assertSafeAddress(entry.address, allowSyntheticProxyAddress)) {
      throw new CatalogNetworkError("blocked-address");
    }
  }
  const first = addresses[0];
  return { address: first.address, family: assertSafeAddress(first.address, allowSyntheticProxyAddress) };
}
function requestOnce(url, signal, pinned, maxBodyBytes) {
  return new Promise((resolve3, reject) => {
    let settled = false;
    let firstByteTimer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (firstByteTimer !== void 0) clearTimeout(firstByteTimer);
      callback();
    };
    const request = https.request(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "accept-encoding": "identity",
        "user-agent": "dsh-community-market/0.1"
      },
      servername: url.hostname,
      lookup: (_hostname, options, callback) => {
        const result = pinnedLookupResult(options, pinned);
        if (Array.isArray(result)) callback(null, result);
        else callback(null, result.address, result.family);
      },
      signal,
      timeout: CONNECT_TIMEOUT_MS
    }, (response) => {
      if (firstByteTimer !== void 0) {
        clearTimeout(firstByteTimer);
        firstByteTimer = void 0;
      }
      void readBody(response, maxBodyBytes).then(
        (body) => finish(() => resolve3({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body
        })),
        (cause) => finish(() => reject(cause))
      );
    });
    firstByteTimer = setTimeout(() => {
      request.destroy(new CatalogNetworkError("timeout"));
    }, FIRST_BYTE_TIMEOUT_MS);
    request.once("error", (cause) => finish(() => reject(cause)));
    request.once("timeout", () => request.destroy(new CatalogNetworkError("timeout")));
    request.end();
  });
}
async function fetchJson(start, signal, resolveAddress, request, allowedOrigin, redirectCount = 0) {
  if (signal.aborted) throw new CatalogNetworkError("timeout");
  const url = validateUrl(start);
  if (allowedOrigin !== void 0 && url.origin !== allowedOrigin) throw new CatalogNetworkError("redirect");
  if (redirectCount > MAX_REDIRECTS) throw new CatalogNetworkError("redirect");
  const pinned = await resolveAddress(url.hostname);
  if (signal.aborted) throw new CatalogNetworkError("timeout");
  const response = await request(url, signal, pinned);
  const status = response.statusCode;
  if (status >= 300 && status < 400) {
    const location = response.headers.location;
    if (location === void 0) throw new CatalogNetworkError("redirect");
    return await fetchJson(
      new URL(location, url).href,
      signal,
      resolveAddress,
      request,
      allowedOrigin,
      redirectCount + 1
    );
  }
  if (status < 200 || status >= 300) throw new CatalogNetworkError("http");
  const contentType = response.headers["content-type"] ?? "";
  const encoding = response.headers["content-encoding"];
  if (!/^(?:application\/json|application\/[^;]+\+json)(?:;|$)/iu.test(contentType) || encoding !== void 0 && encoding !== "identity") {
    throw new CatalogNetworkError("response");
  }
  let value;
  try {
    value = JSON.parse(response.body.toString("utf8"));
  } catch {
    throw new CatalogNetworkError("response");
  }
  return { value, finalUrl: url.href };
}
function createRestrictedHttpClient(options = {}) {
  const syntheticProxyHostnames = new Set(
    (options.syntheticProxyHostnames ?? []).map((hostname) => hostname.toLowerCase())
  );
  const lookupAddresses = options.lookupAddresses ?? defaultLookupAddresses;
  const resolveAddress = options.resolveAddress ?? (async (hostname) => await resolvePinnedAddress(hostname, lookupAddresses, syntheticProxyHostnames));
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
  const request = options.request ?? (async (url, signal, pinned) => await requestOnce(url, signal, pinned, maxBodyBytes));
  const totalTimeoutMs = options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS;
  return {
    async getJson(start, signal, policy = {}) {
      if (signal.aborted) throw new CatalogNetworkError("timeout");
      const totalController = new AbortController();
      let rejectAbort;
      const aborted = new Promise((_resolve, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => {
        const cause = signal.reason ?? new DOMException("The operation was aborted", "AbortError");
        totalController.abort(cause);
        rejectAbort(cause);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      let totalTimer;
      const timedOut = new Promise((_resolve, reject) => {
        totalTimer = setTimeout(() => {
          const cause = new CatalogNetworkError("timeout");
          totalController.abort(cause);
          reject(cause);
        }, totalTimeoutMs);
      });
      const operation = fetchJson(start, totalController.signal, resolveAddress, request, policy.allowedOrigin);
      try {
        return await Promise.race([operation, aborted, timedOut]);
      } finally {
        clearTimeout(totalTimer);
        signal.removeEventListener("abort", onAbort);
      }
    }
  };
}
function awaitCachedResponse(promise, signal, release) {
  const abortReason = () => signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  if (signal.aborted) {
    release();
    return Promise.reject(abortReason());
  }
  return new Promise((resolve3, reject) => {
    let settled = false;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      release();
      callback();
    };
    const onAbort = () => finish(() => reject(abortReason()));
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (response) => finish(() => resolve3(response)),
      (cause) => finish(() => reject(cause))
    );
  });
}
function createCachedCatalogHttpClient(delegate, options = {}) {
  const ttlMs = options.ttlMs ?? 5 * 60 * 1e3;
  const now = options.now ?? Date.now;
  const cache = /* @__PURE__ */ new Map();
  return {
    async getJson(url, signal, policy = {}) {
      if (signal.aborted) {
        throw signal.reason ?? new DOMException("The operation was aborted", "AbortError");
      }
      const key = `${policy.allowedOrigin ?? ""}\0${url}`;
      let entry = cache.get(key);
      if (entry === void 0 || policy.cacheMode === "reload") {
        entry = { waiters: 0 };
        cache.set(key, entry);
      }
      if (entry.response !== void 0 && entry.savedAt !== void 0 && now() - entry.savedAt < ttlMs) {
        return entry.response;
      }
      if (entry.inFlight === void 0) {
        const inFlightController = new AbortController();
        entry.inFlightController = inFlightController;
        const request = delegate.getJson(url, inFlightController.signal, policy);
        entry.inFlight = request;
        void request.then(
          (response) => {
            if (entry.inFlight !== request || inFlightController.signal.aborted) return;
            entry.response = response;
            entry.savedAt = now();
          },
          () => {
          }
        ).finally(() => {
          if (entry.inFlight === request) {
            delete entry.inFlight;
            delete entry.inFlightController;
          }
        });
      }
      entry.waiters += 1;
      let released = false;
      return await awaitCachedResponse(entry.inFlight, signal, () => {
        if (released) return;
        released = true;
        entry.waiters -= 1;
        if (entry.waiters === 0 && entry.inFlightController !== void 0) {
          const abandoned = entry.inFlight;
          entry.inFlightController.abort();
          if (entry.inFlight === abandoned) {
            delete entry.inFlight;
            delete entry.inFlightController;
          }
        }
      });
    }
  };
}
var restrictedHttpClient = createRestrictedHttpClient();

// src/adapters/dsh-1024store.ts
var DSH_1024STORE_KEY = "dsh-1024store";
var DSH_1024STORE_ENDPOINT = "https://deepseek1024.com/api/v1/plugins";
var DSH_1024STORE_HOSTNAME = "deepseek1024.com";
var DSH_1024STORE_PROVIDER_ID = "com.deepseek1024.catalog";
var DSH_1024STORE_ADAPTER_ID = "market.dsh-1024store-v1";
var GITHUB_OWNER_PATTERN = /^[a-z0-9][a-z0-9-]{0,99}$/iu;
var GITHUB_REPOSITORY_PATTERN = /^[a-z0-9._-]{1,100}$/iu;
var NPM_PACKAGE_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
var STABLE_SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
function plainText(value, max, fallback) {
  if (typeof value !== "string" || value.length === 0 || value.length > max || /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value)) return fallback;
  return value;
}
function completeCatalogQuery(query) {
  return query.q === void 0 && (query.category === void 0 || query.category.length === 0) && (query.capability === void 0 || query.capability.length === 0);
}
function providerTotal(meta, receivedPackages) {
  const total = meta.total;
  if (total === void 0) return void 0;
  if (typeof total !== "number" || !Number.isSafeInteger(total) || total > 1e4) {
    throw new Error("1024Store provider total is inconsistent");
  }
  if (total < receivedPackages) return void 0;
  return total;
}
function reviewedNpmTarget(item) {
  if (!Array.isArray(item.installMethods)) return void 0;
  const targets = /* @__PURE__ */ new Map();
  for (const value of item.installMethods) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
    const method = value;
    if (method.kind !== "npm" || method.verification !== "verified" || method.code !== "repository_backlink" || method.requiresBuildAllowance !== false || typeof method.spec !== "string" || typeof method.revision !== "string" || !NPM_PACKAGE_PATTERN.test(method.spec) || !STABLE_SEMVER_PATTERN.test(method.revision)) continue;
    targets.set(`${method.spec}@${method.revision}`, { name: method.spec, version: method.revision });
  }
  return targets.size === 1 ? targets.values().next().value : void 0;
}
function repositoryFromItem(item) {
  try {
    if (typeof item.url !== "string") return void 0;
    const suppliedUrl = new URL(item.url);
    const suppliedPath = suppliedUrl.pathname.split("/").filter(Boolean);
    if (suppliedUrl.protocol !== "https:" || suppliedUrl.hostname.toLowerCase() !== "github.com" || suppliedUrl.username || suppliedUrl.password || suppliedUrl.search || suppliedUrl.hash || suppliedPath.length !== 2) return void 0;
    const owner = suppliedPath[0];
    const repository = suppliedPath[1].replace(/\.git$/iu, "");
    if (!GITHUB_OWNER_PATTERN.test(owner) || !GITHUB_REPOSITORY_PATTERN.test(repository)) return void 0;
    const parts = typeof item.id === "string" ? item.id.split("/").filter(Boolean) : [];
    const idMatchesRepository = parts.length >= 2 && parts[0].toLowerCase() === owner.toLowerCase() && parts[1].replace(/\.git$/iu, "").toLowerCase() === repository.toLowerCase();
    return normalizeRepositoryIdentity({
      // The provider item ID is source-local identity, not repository identity.
      // Repository renames and transfers make the canonical URL authoritative.
      url: `https://github.com/${owner}/${repository}`,
      ...idMatchesRepository && parts.length > 2 ? { subdirectory: parts.slice(2).join("/") } : {}
    });
  } catch {
    return void 0;
  }
}
function githubOwner(repositoryUrl) {
  try {
    const url = new URL(repositoryUrl);
    const owner = url.pathname.split("/").filter(Boolean)[0];
    return owner !== void 0 && GITHUB_OWNER_PATTERN.test(owner) ? owner.toLowerCase() : void 0;
  } catch {
    return void 0;
  }
}
function explicitIcon(item) {
  if (item.media === null || typeof item.media !== "object" || Array.isArray(item.media)) return void 0;
  const icon = item.media.icon;
  if (icon === null || typeof icon !== "object" || Array.isArray(icon)) return void 0;
  const candidate = icon;
  if (typeof candidate.url !== "string") return void 0;
  try {
    const url = new URL(candidate.url);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.hash || ![DSH_1024STORE_HOSTNAME, "github.com", "avatars.githubusercontent.com"].includes(hostname)) return void 0;
    const alt = plainText(candidate.alt, 240, "");
    return {
      remoteUrl: url.href,
      ...alt ? { alt } : {},
      allowedHostnames: hostname === "github.com" ? ["github.com", "avatars.githubusercontent.com"] : [hostname]
    };
  } catch {
    return void 0;
  }
}
function mediaCandidates(item, repositoryUrl) {
  const explicit = explicitIcon(item);
  const owner = githubOwner(repositoryUrl);
  return [
    ...explicit === void 0 ? [] : [{ ...explicit, role: "plugin-icon" }],
    ...owner === void 0 ? [] : [{
      remoteUrl: `https://github.com/${owner}.png?size=96`,
      role: "publisher-avatar",
      alt: owner,
      allowedHostnames: ["github.com", "avatars.githubusercontent.com"]
    }]
  ];
}
function resolvedMedia(candidates, itemId, context) {
  for (const candidate of candidates) {
    try {
      const assetRef = context.media.register({
        ...candidate,
        sourceRecordId: context.source.sourceRecordId,
        itemId
      });
      return { icon: { assetRef, role: candidate.role, ...candidate.alt === void 0 ? {} : { alt: candidate.alt } } };
    } catch {
    }
  }
  return void 0;
}
function normalizedItem(entry, context, locale) {
  try {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return void 0;
    const item = entry;
    const id = plainText(item.id, 160, "");
    const name2 = plainText(item.name, 120, "");
    if (!id || !name2 || !/^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u.test(id)) return void 0;
    const repository = repositoryFromItem(item);
    if (repository === void 0) return void 0;
    const descriptionValue = item.description;
    const description = descriptionValue !== null && typeof descriptionValue === "object" ? descriptionValue : {};
    const prefersChinese = locale?.toLowerCase().startsWith("zh") ?? false;
    const summary = plainText(
      prefersChinese ? description.zh ?? description.en : description.en ?? description.zh,
      1e3,
      name2
    );
    const category = typeof item.category === "string" && /^[a-z0-9][a-z0-9._:-]*$/u.test(item.category) ? item.category : void 0;
    const repositoryOwner = githubOwner(repository.url);
    const suppliedOwner = plainText(item.owner, 120, "");
    const owner = repositoryOwner !== void 0 && suppliedOwner.toLowerCase() === repositoryOwner ? suppliedOwner : repositoryOwner;
    const pushedAt = typeof item.pushedAt === "string" && !Number.isNaN(Date.parse(item.pushedAt)) ? new Date(item.pushedAt).toISOString() : void 0;
    const npmTarget = reviewedNpmTarget(item);
    const addedAt = typeof item.added === "string" && !Number.isNaN(Date.parse(item.added)) ? Date.parse(item.added) : 0;
    const normalized = {
      id,
      name: name2,
      displayName: name2,
      summary,
      ...descriptionValue === void 0 ? {} : { description: summary },
      ...category === void 0 ? {} : { categories: [category] },
      repository,
      ...npmTarget === void 0 ? {} : {
        latestVersion: npmTarget.version,
        package: { registry: "npm", name: npmTarget.name }
      },
      ...owner === void 0 ? {} : { publisher: { name: owner, url: `https://github.com/${owner}` } },
      ...pushedAt === void 0 ? {} : { updatedAt: pushedAt },
      provenance: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        itemId: id
      }
    };
    return {
      item: normalized,
      mediaCandidates: mediaCandidates(item, repository.url),
      stars: typeof item.stars === "number" && Number.isFinite(item.stars) ? item.stars : 0,
      downloads: typeof item.installCount === "number" && Number.isFinite(item.installCount) ? item.installCount : 0,
      updatedAt: pushedAt === void 0 ? addedAt : Date.parse(pushedAt)
    };
  } catch {
    return void 0;
  }
}
function compareCandidates(left, right, query) {
  if (query.sort === "name") return left.item.displayName.localeCompare(right.item.displayName, "en", { sensitivity: "base" });
  if (query.sort === "updated") return right.updatedAt - left.updatedAt || right.stars - left.stars;
  if (query.sort === "downloads") return right.downloads - left.downloads || right.stars - left.stars;
  return right.stars - left.stars || left.item.displayName.localeCompare(right.item.displayName, "en", { sensitivity: "base" });
}
function buildSnapshot(value, context, finalUrl, query) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("1024Store response is not an object");
  const raw = value;
  if (!Array.isArray(raw.packages) || raw.packages.length > 1e4) throw new Error("1024Store catalog is invalid");
  if (query.cursor !== void 0 && !/^\d+$/u.test(query.cursor)) throw new Error("1024Store cursor is invalid");
  const requestedCategories = new Set(query.category ?? []);
  const search = query.q?.toLocaleLowerCase("en-US");
  const candidates = raw.packages.map((entry) => normalizedItem(entry, context, query.locale)).filter((candidate) => candidate !== void 0).filter((candidate) => requestedCategories.size === 0 || candidate.item.categories?.some((category) => requestedCategories.has(category)) === true).filter(() => query.capability === void 0 || query.capability.length === 0).filter((candidate) => search === void 0 || [
    candidate.item.id,
    candidate.item.displayName,
    candidate.item.publisher?.name ?? "",
    candidate.item.summary
  ].some((value2) => value2.toLocaleLowerCase("en-US").includes(search))).sort((left, right) => compareCandidates(left, right, query));
  const offset = Number(query.cursor ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > candidates.length) throw new Error("1024Store cursor is invalid");
  const limit = Math.min(query.limit ?? 50, 50);
  const end = Math.min(offset + limit, candidates.length);
  const meta = raw.meta !== null && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? raw.meta : {};
  const generatedAt = typeof meta.generatedAt === "string" ? meta.generatedAt : meta.updated;
  const providerGeneratedAt = typeof generatedAt === "string" && !Number.isNaN(Date.parse(generatedAt)) ? new Date(generatedAt).toISOString() : void 0;
  const providerRevision = plainText(meta.revision, 160, "") || void 0;
  const total = completeCatalogQuery(query) ? providerTotal(meta, raw.packages.length) ?? candidates.length : candidates.length;
  return parseCatalogSnapshot({
    schemaVersion: "1.0.0",
    source: {
      sourceRecordId: context.source.sourceRecordId,
      providerId: context.source.providerId,
      adapterId: context.source.adapterId,
      registrationKind: context.source.registrationKind,
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString(),
      finalUrl,
      ...providerGeneratedAt === void 0 ? {} : { providerGeneratedAt },
      ...providerRevision === void 0 ? {} : { providerRevision }
    },
    items: candidates.slice(offset, end).map((candidate) => {
      const media = resolvedMedia(candidate.mediaCandidates, candidate.item.id, context);
      return media === void 0 ? candidate.item : { ...candidate.item, media };
    }),
    page: end < candidates.length ? { nextCursor: String(end), total } : { total }
  });
}
function buildCatalogScanSnapshots(value, context, finalUrl, locale) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("1024Store response is not an object");
  }
  const raw = value;
  if (!Array.isArray(raw.packages) || raw.packages.length > 1e4) {
    throw new Error("1024Store catalog is invalid");
  }
  context.signal.throwIfAborted();
  const items = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of raw.packages) {
    const candidate = normalizedItem(entry, context, locale);
    if (candidate === void 0) continue;
    if (seen.has(candidate.item.id)) throw new Error("1024Store catalog contains duplicate item IDs");
    seen.add(candidate.item.id);
    if (candidate.item.package?.registry === "npm" && candidate.item.latestVersion !== void 0 && candidate.item.repository !== void 0) {
      const media = resolvedMedia(candidate.mediaCandidates, candidate.item.id, context);
      const item = {
        ...candidate.item,
        repository: candidate.item.repository,
        latestVersion: candidate.item.latestVersion,
        package: candidate.item.package,
        ...media === void 0 ? {} : { media }
      };
      items.push(item);
    } else {
      items.push(candidate.item);
    }
  }
  const meta = raw.meta !== null && typeof raw.meta === "object" && !Array.isArray(raw.meta) ? raw.meta : {};
  const generatedAt = typeof meta.generatedAt === "string" ? meta.generatedAt : meta.updated;
  const providerGeneratedAt = typeof generatedAt === "string" && !Number.isNaN(Date.parse(generatedAt)) ? new Date(generatedAt).toISOString() : void 0;
  const providerRevision = plainText(meta.revision, 160, "") || void 0;
  const total = providerTotal(meta, raw.packages.length) ?? items.length;
  if (total !== items.length) throw new Error("1024Store scan did not reach the provider total");
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  const snapshots = [];
  for (let offset = 0; offset < items.length; offset += 100) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: "1.0.0",
      source: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        adapterId: context.source.adapterId,
        registrationKind: context.source.registrationKind,
        fetchedAt,
        finalUrl,
        ...providerGeneratedAt === void 0 ? {} : { providerGeneratedAt },
        ...providerRevision === void 0 ? {} : { providerRevision }
      },
      items: items.slice(offset, offset + 100),
      page: { total }
    }));
  }
  if (snapshots.length === 0) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: "1.0.0",
      source: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        adapterId: context.source.adapterId,
        registrationKind: context.source.registrationKind,
        fetchedAt,
        finalUrl,
        ...providerGeneratedAt === void 0 ? {} : { providerGeneratedAt },
        ...providerRevision === void 0 ? {} : { providerRevision }
      },
      items: [],
      page: { total: 0 }
    }));
  }
  return snapshots;
}
var dsh1024StoreAdapter = {
  adapterId: DSH_1024STORE_ADAPTER_ID,
  async fetch(queryValue, context) {
    const query = { ...queryValue, limit: Math.min(queryValue.limit ?? 50, 50) };
    const expectedOrigin = new URL(DSH_1024STORE_ENDPOINT).origin;
    const response = await context.http.getJson(
      DSH_1024STORE_ENDPOINT,
      context.signal,
      { allowedOrigin: expectedOrigin }
    );
    let finalOrigin;
    try {
      finalOrigin = new URL(response.finalUrl).origin;
    } catch {
      throw new Error("1024Store final URL is invalid");
    }
    if (finalOrigin !== expectedOrigin) throw new Error("1024Store response changed the reviewed provider origin");
    return buildSnapshot(response.value, context, response.finalUrl, query);
  },
  async scanCatalog(query, context) {
    const expectedOrigin = new URL(DSH_1024STORE_ENDPOINT).origin;
    const response = await context.http.getJson(
      DSH_1024STORE_ENDPOINT,
      context.signal,
      { allowedOrigin: expectedOrigin }
    );
    context.signal.throwIfAborted();
    let finalOrigin;
    try {
      finalOrigin = new URL(response.finalUrl).origin;
    } catch {
      throw new Error("1024Store final URL is invalid");
    }
    if (finalOrigin !== expectedOrigin) throw new Error("1024Store response changed the reviewed provider origin");
    return buildCatalogScanSnapshots(response.value, context, response.finalUrl, query.locale);
  }
};

// src/adapters/dshfind.ts
var DSHFIND_KEY = "dshfind";
var DSHFIND_ENDPOINT = "https://api.dshfind.com/v1/plugins";
var DSHFIND_HOSTNAME = "api.dshfind.com";
var DSHFIND_PROVIDER_ID = "com.dshfind.catalog";
var DSHFIND_ADAPTER_ID = "market.dshfind-v1";
var DSHFIND_ORIGIN = `https://${DSHFIND_HOSTNAME}`;
var DSHFIND_PAGE_SIZE = 100;
var MAX_DSHFIND_ITEMS = 1e4;
var MAX_DSHFIND_PAGES = 100;
var DEFAULT_INTER_PAGE_DELAY_MS = 2100;
var IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$/u;
var GITHUB_OWNER_PATTERN2 = /^[a-z0-9][a-z0-9-]{0,99}$/iu;
var GITHUB_REPOSITORY_PATTERN2 = /^[a-z0-9._-]{1,100}$/iu;
var CATEGORY_PATTERN = /^[a-z0-9][a-z0-9._:-]*$/u;
var DATA_VERSION_PATTERN = /^sha256:[0-9a-f]{64}$/u;
var NPM_PACKAGE_PATTERN2 = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
var STABLE_SEMVER_PATTERN2 = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
var MAX_NPM_PACKAGE_LENGTH = 214;
var MAX_NPM_VERSION_LENGTH = 64;
var UNSAFE_TEXT_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u;
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`dshfind ${label} is invalid`);
  }
  return value;
}
function dateTime(value, label) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`dshfind ${label} is invalid`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`dshfind ${label} is invalid`);
  return new Date(timestamp).toISOString();
}
function plainText2(value, maxLength, allowEmpty = false) {
  if (typeof value !== "string" || value.length > maxLength || UNSAFE_TEXT_PATTERN.test(value)) return void 0;
  if (!allowEmpty && value.length === 0) return void 0;
  return value;
}
function assertFinalOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("dshfind final URL is invalid");
  }
  if (url.origin !== DSHFIND_ORIGIN) {
    throw new Error("dshfind response changed the reviewed provider origin");
  }
  return url.href;
}
function parseRawPage(value, expectedPage) {
  const raw = record(value);
  if (raw === void 0 || !Array.isArray(raw.data)) throw new Error("dshfind response is invalid");
  const page = safeInteger(raw.page, "page", 1);
  const perPage = safeInteger(raw.per_page, "per_page", 1);
  const total = safeInteger(raw.total, "total");
  const totalPages = safeInteger(raw.total_pages, "total_pages");
  if (page !== expectedPage) throw new Error("dshfind response page did not match the request");
  if (perPage !== DSHFIND_PAGE_SIZE) throw new Error("dshfind response changed the requested page size");
  if (total > MAX_DSHFIND_ITEMS) throw new Error("dshfind catalog exceeded the item limit");
  if (totalPages > MAX_DSHFIND_PAGES) throw new Error("dshfind catalog exceeded the page limit");
  const calculatedPages = total === 0 ? 0 : Math.ceil(total / DSHFIND_PAGE_SIZE);
  if (totalPages !== calculatedPages) throw new Error("dshfind response page metadata is inconsistent");
  if (totalPages > 0 && page > totalPages) throw new Error("dshfind response page exceeded total_pages");
  const expectedItems = totalPages === 0 ? 0 : page < totalPages ? DSHFIND_PAGE_SIZE : total - (page - 1) * DSHFIND_PAGE_SIZE;
  if (raw.data.length !== expectedItems || raw.data.length > DSHFIND_PAGE_SIZE) {
    throw new Error("dshfind response item count did not match its page metadata");
  }
  if (typeof raw.data_version !== "string" || !DATA_VERSION_PATTERN.test(raw.data_version)) {
    throw new Error("dshfind data_version is invalid");
  }
  return {
    data: raw.data,
    page,
    perPage,
    total,
    totalPages,
    dataVersion: raw.data_version,
    asOf: dateTime(raw.as_of, "as_of")
  };
}
function repositoryFromItem2(raw) {
  if (typeof raw.repository_url !== "string") return void 0;
  try {
    const supplied = new URL(raw.repository_url);
    const segments = supplied.pathname.split("/").filter(Boolean);
    if (supplied.protocol !== "https:" || supplied.hostname.toLowerCase() !== "github.com" || supplied.username || supplied.password || supplied.search || supplied.hash || segments.length !== 2) return void 0;
    const owner = segments[0];
    const repositoryName = segments[1].replace(/\.git$/iu, "");
    if (!GITHUB_OWNER_PATTERN2.test(owner) || !GITHUB_REPOSITORY_PATTERN2.test(repositoryName)) return void 0;
    const fullName = typeof raw.full_name === "string" ? raw.full_name.split("/") : [];
    if (fullName.length !== 2 || fullName[0].toLowerCase() !== owner.toLowerCase() || fullName[1].replace(/\.git$/iu, "").toLowerCase() !== repositoryName.toLowerCase()) return void 0;
    return {
      repository: normalizeRepositoryIdentity({ url: `https://github.com/${owner}/${repositoryName}` }),
      owner
    };
  } catch {
    return void 0;
  }
}
function keywords(value, languageValue) {
  const language = plainText2(languageValue, 64);
  const tags = Array.isArray(value) ? value : [];
  const result = [];
  const seen = /* @__PURE__ */ new Set();
  const maximumTags = language === void 0 ? 64 : 63;
  for (const raw of tags) {
    const keyword = plainText2(raw, 64);
    if (keyword === void 0 || seen.has(keyword)) continue;
    seen.add(keyword);
    result.push(keyword);
    if (result.length === maximumTags) break;
  }
  if (language !== void 0 && !seen.has(language)) result.push(language);
  return result.length === 0 ? void 0 : result;
}
function reviewedNpmTarget2(install) {
  if (install === void 0 || !Array.isArray(install.methods)) return void 0;
  const packageName = typeof install.pkg_name === "string" ? install.pkg_name : void 0;
  const targets = /* @__PURE__ */ new Map();
  for (const value of install.methods) {
    const method = record(value);
    if (method === void 0) continue;
    if (method.kind !== "npm" || method.verification !== "verified" || method.code !== "repository_backlink" || method.requiresBuildAllowance !== false || typeof method.spec !== "string" || typeof method.revision !== "string" || method.spec.length > MAX_NPM_PACKAGE_LENGTH || method.revision.length > MAX_NPM_VERSION_LENGTH || !NPM_PACKAGE_PATTERN2.test(method.spec) || !STABLE_SEMVER_PATTERN2.test(method.revision) || packageName !== void 0 && method.spec !== packageName) continue;
    targets.set(`${method.spec}@${method.revision}`, { spec: method.spec, revision: method.revision });
  }
  return targets.size === 1 ? targets.values().next().value : void 0;
}
function normalizeItem(value, context) {
  const raw = record(value);
  if (raw === void 0) return void 0;
  if (raw.is_risky === true) return void 0;
  const id = plainText2(raw.full_name, 160);
  const name2 = plainText2(raw.name, 120);
  if (id === void 0 || name2 === void 0 || !IDENTIFIER_PATTERN.test(id)) return void 0;
  const identity2 = repositoryFromItem2(raw);
  if (identity2 === void 0) return void 0;
  const description = plainText2(raw.description, 5e3, true);
  const summaryCandidate = description === void 0 ? void 0 : Array.from(description).slice(0, 1e3).join("");
  const summary = summaryCandidate ? summaryCandidate : name2;
  const category = typeof raw.category === "string" && CATEGORY_PATTERN.test(raw.category) ? raw.category : void 0;
  const itemKeywords = keywords(raw.tags, raw.language);
  const suppliedOwner = plainText2(raw.owner, 120);
  const owner = suppliedOwner?.toLowerCase() === identity2.owner.toLowerCase() ? suppliedOwner : identity2.owner;
  const pushedAt = typeof raw.pushed_at === "string" && Number.isFinite(Date.parse(raw.pushed_at)) ? new Date(Date.parse(raw.pushed_at)).toISOString() : void 0;
  const npmTarget = reviewedNpmTarget2(record(raw.install));
  return {
    id,
    name: name2,
    displayName: name2,
    summary,
    ...description === void 0 ? {} : { description },
    ...category === void 0 ? {} : { categories: [category] },
    ...itemKeywords === void 0 ? {} : { keywords: [...itemKeywords] },
    repository: identity2.repository,
    publisher: {
      name: owner,
      url: `https://github.com/${identity2.owner.toLowerCase()}`
    },
    ...pushedAt === void 0 ? {} : { updatedAt: pushedAt },
    // install.cmd and install.pkg_name stay non-executable catalog identity.
    // A package target is exposed only when the provider-reviewed
    // install.methods carry exactly one verified exact-version npm target;
    // the Host still rechecks that version against the npm registry itself
    // before it can create an install intent at preview time.
    ...npmTarget === void 0 ? {} : {
      package: { registry: "npm", name: npmTarget.spec },
      latestVersion: npmTarget.revision
    },
    provenance: {
      sourceRecordId: context.source.sourceRecordId,
      providerId: context.source.providerId,
      itemId: id
    }
  };
}
function waitForNextPage(delayMs, signal) {
  signal.throwIfAborted();
  if (delayMs === 0) return Promise.resolve();
  return new Promise((resolve3, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve3();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
}
function pageUrl(page, dataVersion) {
  const url = new URL(DSHFIND_ENDPOINT);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(DSHFIND_PAGE_SIZE));
  if (dataVersion !== void 0) url.searchParams.set("data_version", dataVersion);
  return url.href;
}
function buildSnapshots(items, dataset, context, fetchedAt) {
  const snapshots = [];
  for (let offset = 0; offset < items.length; offset += DSHFIND_PAGE_SIZE) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: "1.0.0",
      source: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        adapterId: context.source.adapterId,
        registrationKind: context.source.registrationKind,
        fetchedAt,
        finalUrl: dataset.finalUrl,
        providerGeneratedAt: dataset.asOf,
        providerRevision: dataset.dataVersion
      },
      items: items.slice(offset, offset + DSHFIND_PAGE_SIZE),
      page: { total: items.length }
    }));
  }
  if (snapshots.length === 0) {
    snapshots.push(parseCatalogSnapshot({
      schemaVersion: "1.0.0",
      source: {
        sourceRecordId: context.source.sourceRecordId,
        providerId: context.source.providerId,
        adapterId: context.source.adapterId,
        registrationKind: context.source.registrationKind,
        fetchedAt,
        finalUrl: dataset.finalUrl,
        providerGeneratedAt: dataset.asOf,
        providerRevision: dataset.dataVersion
      },
      items: [],
      page: { total: 0 }
    }));
  }
  return snapshots;
}
function querySnapshot(query, snapshots) {
  const first = snapshots[0];
  if (first === void 0) throw new Error("dshfind scan did not produce a snapshot");
  const categories = new Set(query.category ?? []);
  const search = query.q?.toLocaleLowerCase("en-US");
  const hasUnsupportedCapabilities = (query.capability?.length ?? 0) > 0;
  let items = snapshots.flatMap((snapshot) => snapshot.items).filter((item) => {
    if (hasUnsupportedCapabilities) return false;
    if (categories.size > 0 && item.categories?.some((category) => categories.has(category)) !== true) return false;
    if (search === void 0) return true;
    return [
      item.id,
      item.name,
      item.displayName,
      item.summary,
      item.description ?? "",
      item.publisher?.name ?? "",
      ...item.keywords ?? []
    ].join("\n").toLocaleLowerCase("en-US").includes(search);
  });
  if (query.sort === "name") {
    items = [...items].sort((left, right) => left.displayName.localeCompare(
      right.displayName,
      query.locale ?? "en",
      { sensitivity: "base" }
    ));
  } else if (query.sort === "updated") {
    items = [...items].sort((left, right) => (Date.parse(right.updatedAt ?? "") || 0) - (Date.parse(left.updatedAt ?? "") || 0));
  }
  const rawCursor = query.cursor ?? "0";
  if (!/^\d+$/u.test(rawCursor)) throw new Error("dshfind cursor is invalid");
  const offset = Number(rawCursor);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > items.length) {
    throw new Error("dshfind cursor is invalid");
  }
  const limit = Math.min(query.limit ?? 50, DSHFIND_PAGE_SIZE);
  const end = Math.min(offset + limit, items.length);
  return parseCatalogSnapshot({
    schemaVersion: "1.0.0",
    source: first.source,
    items: items.slice(offset, end),
    page: {
      total: items.length,
      ...end < items.length ? { nextCursor: String(end) } : {}
    }
  });
}
function createDshfindAdapter(options = {}) {
  const interPageDelayMs = options.interPageDelayMs ?? DEFAULT_INTER_PAGE_DELAY_MS;
  if (!Number.isSafeInteger(interPageDelayMs) || interPageDelayMs < 0) {
    throw new TypeError("invalid dshfind inter-page delay");
  }
  const now = options.now ?? (() => /* @__PURE__ */ new Date());
  const scanCatalog = async (_query, context) => {
    const items = [];
    const seen = /* @__PURE__ */ new Set();
    let dataset;
    let expectedPage = 1;
    while (true) {
      context.signal.throwIfAborted();
      const response = await context.http.getJson(
        pageUrl(expectedPage, dataset?.dataVersion),
        context.signal,
        { allowedOrigin: DSHFIND_ORIGIN }
      );
      context.signal.throwIfAborted();
      const finalUrl = assertFinalOrigin(response.finalUrl);
      const page = parseRawPage(response.value, expectedPage);
      if (dataset === void 0) {
        dataset = {
          total: page.total,
          totalPages: page.totalPages,
          dataVersion: page.dataVersion,
          asOf: page.asOf,
          finalUrl
        };
      } else if (page.total !== dataset.total || page.totalPages !== dataset.totalPages || page.dataVersion !== dataset.dataVersion || page.asOf !== dataset.asOf) {
        throw new Error("dshfind dataset changed during pagination");
      }
      for (const rawItem of page.data) {
        const raw = record(rawItem);
        const rawId = raw === void 0 ? void 0 : plainText2(raw.full_name, 160);
        if (rawId !== void 0 && IDENTIFIER_PATTERN.test(rawId)) {
          const duplicateKey = rawId.toLocaleLowerCase("en-US");
          if (seen.has(duplicateKey)) throw new Error("dshfind catalog contains duplicate item IDs");
          seen.add(duplicateKey);
        }
        const item = normalizeItem(rawItem, context);
        if (item !== void 0) items.push(item);
      }
      if (page.totalPages === 0 || expectedPage >= page.totalPages) break;
      if (expectedPage >= MAX_DSHFIND_PAGES) throw new Error("dshfind catalog exceeded the page limit");
      await waitForNextPage(interPageDelayMs, context.signal);
      expectedPage += 1;
    }
    if (dataset === void 0) throw new Error("dshfind scan did not return dataset metadata");
    return buildSnapshots(items, dataset, context, now().toISOString());
  };
  return {
    adapterId: DSHFIND_ADAPTER_ID,
    async fetch(query, context) {
      return querySnapshot(query, await scanCatalog(query, context));
    },
    scanCatalog
  };
}
var dshfindAdapter = createDshfindAdapter();

// src/contracts/query.ts
function queryWithoutCursor(query) {
  const { cursor: _cursor, ...rest } = query;
  return rest;
}
function queryKey(query) {
  const normalized = queryWithoutCursor(query);
  return JSON.stringify({
    q: normalized.q,
    category: normalized.category,
    capability: normalized.capability,
    limit: normalized.limit,
    sort: normalized.sort,
    locale: normalized.locale
  });
}
function normalizeCatalogQuery(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return parseCatalogQuery(value);
  }
  const input = value;
  const normalized = { ...input };
  if (typeof normalized.q === "string") {
    const q = normalized.q.trim();
    if (q) normalized.q = q;
    else delete normalized.q;
  }
  if (normalized.limit === void 0) normalized.limit = 50;
  if (Array.isArray(normalized.category)) normalized.category = [...normalized.category];
  if (Array.isArray(normalized.capability)) normalized.capability = [...normalized.capability];
  return parseCatalogQuery(normalized);
}
function supports(source, field) {
  return source.query.supported.includes(field);
}
function serializeCatalogQuery(sourceValue, queryValue) {
  const source = parseCatalogSource(sourceValue);
  const query = normalizeCatalogQuery(queryValue);
  const url = new URL(source.transport.endpoint);
  if (supports(source, "q") && query.q !== void 0) url.searchParams.set("q", query.q);
  if (supports(source, "category")) {
    for (const category of query.category ?? []) url.searchParams.append("category", category);
  }
  if (supports(source, "capability")) {
    for (const capability of query.capability ?? []) url.searchParams.append("capability", capability);
  }
  if (supports(source, "cursor") && query.cursor !== void 0) url.searchParams.set("cursor", query.cursor);
  if (supports(source, "limit")) {
    url.searchParams.set("limit", String(Math.min(query.limit ?? 50, source.query.maxLimit)));
  }
  if (supports(source, "sort") && query.sort !== void 0) {
    const supportedSorts = source.query.sorts;
    if (!supportedSorts.includes(query.sort)) {
      throw new CatalogContractError("query", [
        semanticIssue("/sort", `is not supported by provider ${source.providerId}`)
      ]);
    }
    url.searchParams.set("sort", query.sort);
  }
  if (supports(source, "locale") && query.locale !== void 0) url.searchParams.set("locale", query.locale);
  return url;
}
function scopeCatalogCursor(value, sourceRecordId, queryValue) {
  if (!value || !sourceRecordId) {
    throw new CatalogContractError("query", [semanticIssue("/cursor", "cursor value and source identity are required")]);
  }
  const query = normalizeCatalogQuery(queryValue);
  return { value, sourceRecordId, queryKey: queryKey(query) };
}
function applyScopedCatalogCursor(cursor, sourceRecordId, queryValue) {
  const query = normalizeCatalogQuery(queryValue);
  if (cursor.sourceRecordId !== sourceRecordId || cursor.queryKey !== queryKey(query)) {
    throw new CatalogContractError("query", [
      semanticIssue("/cursor", "does not belong to this source and effective query")
    ]);
  }
  return parseCatalogQuery({ ...queryWithoutCursor(query), cursor: cursor.value });
}

// src/adapters/standard-http.ts
function safeHttpsUrl(value, label) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443") {
    throw new Error(`${label} must use credential-free standard HTTPS port 443 without a fragment`);
  }
  return url;
}
function requireOrigin(value, expectedOrigin, label) {
  const url = safeHttpsUrl(value, label);
  if (url.origin !== expectedOrigin) throw new Error(`${label} changed the registered source origin`);
  return url;
}
function assertStandardSourceTrustRoot(manifestUrlValue, manifestFinalUrl, endpointValue) {
  const manifestUrl = safeHttpsUrl(manifestUrlValue, "standard source manifest URL");
  requireOrigin(manifestFinalUrl, manifestUrl.origin, "standard source manifest final URL");
  requireOrigin(endpointValue, manifestUrl.origin, "standard source endpoint");
  return manifestUrl.origin;
}
function snapshotFromPage(page, context, finalUrl) {
  const fetchedAt = (/* @__PURE__ */ new Date()).toISOString();
  const providerOrigin = new URL(finalUrl).origin;
  return parseCatalogSnapshot({
    schemaVersion: "1.0.0",
    source: {
      sourceRecordId: context.source.sourceRecordId,
      providerId: context.source.providerId,
      adapterId: context.source.adapterId,
      registrationKind: context.source.registrationKind,
      fetchedAt,
      finalUrl,
      ...page.generatedAt === void 0 ? {} : { providerGeneratedAt: page.generatedAt },
      ...page.revision === void 0 ? {} : { providerRevision: page.revision }
    },
    items: page.items.map((item) => {
      const { media, repository, ...plainItem } = item;
      const normalizedRepository = repository === void 0 ? void 0 : normalizeRepositoryIdentity(repository);
      let resolvedMedia2;
      if (media !== void 0) {
        try {
          const remoteUrl = new URL(media.icon.url);
          if (remoteUrl.origin !== providerOrigin) {
            throw new Error("standard catalog icons must use the provider response origin");
          }
          const assetRef = context.media.register({
            remoteUrl: remoteUrl.href,
            role: "plugin-icon",
            ...media.icon.alt === void 0 ? {} : { alt: media.icon.alt },
            sourceRecordId: context.source.sourceRecordId,
            itemId: item.id,
            allowedHostnames: [remoteUrl.hostname]
          });
          resolvedMedia2 = {
            icon: {
              assetRef,
              role: "plugin-icon",
              ...media.icon.alt === void 0 ? {} : { alt: media.icon.alt }
            }
          };
        } catch {
        }
      }
      return {
        ...plainItem,
        ...normalizedRepository === void 0 ? {} : { repository: normalizedRepository },
        ...resolvedMedia2 === void 0 ? {} : { media: resolvedMedia2 },
        provenance: {
          sourceRecordId: context.source.sourceRecordId,
          providerId: context.source.providerId,
          itemId: item.id
        }
      };
    }),
    page: page.page
  });
}
var standardHttpAdapter = {
  adapterId: "market.standard-http-v1",
  async fetch(queryValue, context) {
    if (context.source.manifestUrl === void 0) throw new Error("standard source has no manifest URL");
    const registeredOrigin = safeHttpsUrl(context.source.manifestUrl, "standard source manifest URL").origin;
    const manifestResponse = await context.http.getJson(
      context.source.manifestUrl,
      context.signal,
      { allowedOrigin: registeredOrigin }
    );
    const manifest = parseCatalogSource(manifestResponse.value);
    if (manifest.providerId !== context.source.providerId) {
      throw new Error("standard source provider identity changed after registration");
    }
    const sourceOrigin = assertStandardSourceTrustRoot(
      context.source.manifestUrl,
      manifestResponse.finalUrl,
      manifest.transport.endpoint
    );
    const query = normalizeCatalogQuery(queryValue);
    const url = serializeCatalogQuery(manifest, query);
    const response = await context.http.getJson(url.href, context.signal, { allowedOrigin: sourceOrigin });
    requireOrigin(response.finalUrl, sourceOrigin, "standard source provider page final URL");
    const effectiveLimit = manifest.query.supported.includes("limit") ? Math.min(query.limit ?? 50, manifest.query.maxLimit) : manifest.query.defaultLimit;
    const page = parseCatalogProviderPage(response.value, effectiveLimit);
    return snapshotFromPage(page, context, response.finalUrl);
  }
};

// src/catalog/service.ts
import { randomUUID } from "node:crypto";
var BUILT_IN_PROVIDERS = [
  {
    key: DSH_1024STORE_KEY,
    name: "DSH 1024Store",
    description: "\u5408\u4F5C\u63D0\u4F9B\u65B9\u76EE\u5F55\u3002\u9700\u8981\u7528\u6237\u660E\u786E\u6DFB\u52A0\u5E76\u542F\u7528\u3002\u76EE\u5F55\u6536\u5F55\u4E0D\u4EE3\u8868\u63D2\u4EF6\u7ECF\u8FC7\u5BA1\u6838\u6216\u63A8\u8350\u3002",
    providerId: DSH_1024STORE_PROVIDER_ID,
    adapterId: DSH_1024STORE_ADAPTER_ID,
    endpoint: DSH_1024STORE_ENDPOINT,
    attribution: {
      name: "DSH 1024Store",
      url: "https://deepseek1024.com",
      notice: "Community catalog data provided by a cooperating provider."
    },
    partnership: true
  },
  {
    key: DSHFIND_KEY,
    name: "dshfind",
    description: "\u5408\u4F5C\u63D0\u4F9B\u65B9\u76EE\u5F55\u3002\u9700\u8981\u7528\u6237\u660E\u786E\u6DFB\u52A0\u5E76\u542F\u7528\u3002\u76EE\u5F55\u6536\u5F55\u4E0D\u4EE3\u8868\u63D2\u4EF6\u7ECF\u8FC7\u5BA1\u6838\u6216\u63A8\u8350\u3002",
    providerId: DSHFIND_PROVIDER_ID,
    adapterId: DSHFIND_ADAPTER_ID,
    endpoint: DSHFIND_ENDPOINT,
    attribution: {
      name: "dshfind",
      url: "https://dshfind.com",
      notice: "Community catalog data provided by a cooperating provider."
    },
    partnership: true
  }
];
var adapters = /* @__PURE__ */ new Map([
  [standardHttpAdapter.adapterId, standardHttpAdapter],
  [dsh1024StoreAdapter.adapterId, dsh1024StoreAdapter],
  [dshfindAdapter.adapterId, dshfindAdapter]
]);
var MAX_CATALOG_ITEMS = 1e4;
var MAX_CATALOG_PAGES = 10001;
var DEFAULT_CATALOG_SCAN_CACHE_TTL_MS = 5 * 60 * 1e3;
function sourceView(record3) {
  const builtIn = record3.builtInProviderKey === void 0 ? void 0 : BUILT_IN_PROVIDERS.find((provider) => provider.key === record3.builtInProviderKey);
  const description = builtIn?.description ?? record3.manifest?.description;
  const attribution = builtIn?.attribution ?? record3.manifest?.attribution;
  return {
    ...record3,
    name: builtIn?.name ?? record3.manifest?.name ?? record3.providerId,
    ...description === void 0 ? {} : { description },
    endpoint: builtIn?.endpoint ?? record3.manifest?.transport.endpoint ?? (record3.manifestUrl === void 0 ? record3.providerId : new URL(record3.manifestUrl).origin),
    ...record3.manifest?.homepage === void 0 ? {} : { homepage: record3.manifest.homepage },
    ...attribution === void 0 ? {} : { attribution },
    partnership: builtIn?.partnership ?? false
  };
}
function catalogScanKey(sourceRecordId, locale) {
  return `${sourceRecordId}\0${locale ?? ""}`;
}
function cachedScanView(entry, cacheStatus) {
  return {
    source: entry.source,
    snapshots: entry.snapshots,
    scannedAt: new Date(entry.scannedAt).toISOString(),
    expiresAt: new Date(entry.expiresAt).toISOString(),
    ...entry.providerRevision === void 0 ? {} : { providerRevision: entry.providerRevision },
    cacheStatus,
    ...entry.locale === void 0 ? {} : { locale: entry.locale },
    scanKey: entry.scanKey,
    sourceGeneration: entry.sourceGeneration
  };
}
function completeItems(index) {
  return index.snapshots.flatMap((snapshot) => snapshot.items);
}
function normalizedSearchText(item) {
  return [
    item.id,
    item.name,
    item.displayName,
    item.summary,
    item.description ?? "",
    item.publisher?.name ?? "",
    ...item.keywords ?? []
  ].join("\n").toLocaleLowerCase("en-US");
}
function matchesCatalogQuery(item, query) {
  const categories = query.category ?? [];
  if (categories.length > 0 && item.categories?.some((value) => categories.includes(value)) !== true) return false;
  const capabilities = /* @__PURE__ */ new Set([
    ...item.capabilities?.required ?? [],
    ...item.capabilities?.optional ?? []
  ]);
  if ((query.capability ?? []).some((value) => !capabilities.has(value))) return false;
  const search = query.q?.toLocaleLowerCase("en-US");
  return search === void 0 || normalizedSearchText(item).includes(search);
}
function sortCatalogItems(items, query) {
  if (query.sort === void 0 || query.sort === "relevance" || query.sort === "downloads") return items;
  return items.map((item, position) => ({ item, position })).sort((left, right) => {
    const compared = query.sort === "name" ? left.item.displayName.localeCompare(right.item.displayName, query.locale ?? "en", { sensitivity: "base" }) : (Date.parse(right.item.updatedAt ?? "") || 0) - (Date.parse(left.item.updatedAt ?? "") || 0);
    return compared || left.position - right.position;
  }).map((value) => value.item);
}
function validateCompleteCatalogScan(source, values) {
  if (values.length > MAX_CATALOG_PAGES) throw new Error("catalog scan exceeded the page limit");
  const snapshots = [];
  const itemIds = /* @__PURE__ */ new Set();
  const revisions = /* @__PURE__ */ new Set();
  let expectedTotal;
  let itemCount = 0;
  for (const value of values) {
    const snapshot = parseCatalogSnapshot(value);
    if (snapshot.source.sourceRecordId !== source.sourceRecordId || snapshot.source.providerId !== source.providerId || snapshot.source.adapterId !== source.adapterId || snapshot.source.registrationKind !== source.registrationKind) throw new Error("catalog scan changed source identity");
    if (snapshot.source.providerRevision !== void 0) revisions.add(snapshot.source.providerRevision);
    if (revisions.size > 1) throw new Error("catalog scan changed provider revision");
    if (snapshot.page.total !== void 0) {
      if (expectedTotal !== void 0 && expectedTotal !== snapshot.page.total) {
        throw new Error("catalog scan changed provider total");
      }
      expectedTotal = snapshot.page.total;
      if (expectedTotal > MAX_CATALOG_ITEMS) throw new Error("catalog scan exceeded the item limit");
    }
    for (const item of snapshot.items) {
      if (item.provenance.sourceRecordId !== source.sourceRecordId || item.provenance.providerId !== source.providerId || item.provenance.itemId !== item.id) throw new Error("catalog scan changed item provenance");
      if (itemIds.has(item.id)) throw new Error("catalog scan contained duplicate item IDs");
      itemIds.add(item.id);
      itemCount += 1;
      if (itemCount > MAX_CATALOG_ITEMS) throw new Error("catalog scan exceeded the item limit");
    }
    snapshots.push(snapshot);
  }
  if (expectedTotal !== void 0 && expectedTotal !== itemCount) {
    throw new Error("catalog scan did not reach the provider total");
  }
  const providerRevision = revisions.values().next().value;
  return {
    snapshots,
    ...providerRevision === void 0 ? {} : { providerRevision }
  };
}
var unavailableMedia = {
  register() {
    throw new Error("catalog media service is unavailable");
  },
  unregisterSource() {
  }
};
var ConcurrencyGate = class {
  constructor(limit) {
    this.limit = limit;
  }
  active = 0;
  waiting = [];
  acquire(signal) {
    if (signal.aborted) {
      return Promise.reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
    }
    if (this.active < this.limit) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise((resolve3, reject) => {
      const onAbort = () => {
        const index = this.waiting.indexOf(waiter);
        if (index >= 0) this.waiting.splice(index, 1);
        reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
      };
      const waiter = { signal, resolve: resolve3, reject, onAbort };
      signal.addEventListener("abort", onAbort, { once: true });
      this.waiting.push(waiter);
    });
  }
  release() {
    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift();
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) {
        waiter.reject(waiter.signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
        continue;
      }
      waiter.resolve();
      return;
    }
    this.active -= 1;
  }
  async run(signal, task) {
    await this.acquire(signal);
    try {
      return await task();
    } finally {
      this.release();
    }
  }
};
var DefaultCatalogService = class {
  constructor(store, http, options = {}) {
    this.store = store;
    this.http = http;
    this.cursorTtlMs = options.cursorTtlMs ?? 30 * 60 * 1e3;
    this.maxCursorEntries = options.maxCursorEntries ?? 512;
    this.catalogScanCacheTtlMs = options.catalogScanCacheTtlMs ?? options.cacheTtlMs ?? DEFAULT_CATALOG_SCAN_CACHE_TTL_MS;
    const maxConcurrentSources = options.maxConcurrentSources ?? 4;
    const maxCacheEntries = options.maxCacheEntries ?? 256;
    if (!Number.isSafeInteger(maxCacheEntries) || maxCacheEntries < 1) {
      throw new TypeError("invalid catalog cache entry limit");
    }
    if (!Number.isSafeInteger(this.maxCursorEntries) || this.maxCursorEntries < 1) {
      throw new TypeError("invalid catalog cursor entry limit");
    }
    if (!Number.isFinite(this.cursorTtlMs) || this.cursorTtlMs <= 0) {
      throw new TypeError("invalid catalog cursor TTL");
    }
    if (!Number.isFinite(this.catalogScanCacheTtlMs) || this.catalogScanCacheTtlMs <= 0) {
      throw new TypeError("invalid catalog scan cache TTL");
    }
    if (!Number.isSafeInteger(maxConcurrentSources) || maxConcurrentSources < 1) {
      throw new TypeError("invalid catalog source concurrency limit");
    }
    this.sourceConcurrency = new ConcurrencyGate(maxConcurrentSources);
    this.now = options.now ?? Date.now;
    this.adapterHttpClients = options.adapterHttpClients ?? /* @__PURE__ */ new Map();
    this.media = options.media ?? unavailableMedia;
    this.observeSnapshot = options.observeSnapshot;
  }
  catalogScanCache = /* @__PURE__ */ new Map();
  cursors = /* @__PURE__ */ new Map();
  sourceGenerations = /* @__PURE__ */ new Map();
  catalogScanGenerations = /* @__PURE__ */ new Map();
  catalogScanControllers = /* @__PURE__ */ new Map();
  catalogScanGates = /* @__PURE__ */ new Map();
  cursorTtlMs;
  maxCursorEntries;
  catalogScanCacheTtlMs;
  sourceConcurrency;
  now;
  adapterHttpClients;
  media;
  observeSnapshot;
  async listSources() {
    const records = await this.store.load();
    return [...records].sort((left, right) => left.order - right.order).map(sourceView);
  }
  invalidateSource(sourceRecordId) {
    this.sourceGenerations.set(sourceRecordId, (this.sourceGenerations.get(sourceRecordId) ?? 0) + 1);
    for (const [key, controllers] of this.catalogScanControllers) {
      if (!key.startsWith(`${sourceRecordId}\0`)) continue;
      for (const controller of controllers) {
        controller.abort(new DOMException("Catalog source was disabled or removed", "AbortError"));
      }
      this.catalogScanControllers.delete(key);
    }
    for (const [key, entry] of this.catalogScanCache) {
      if (entry.sourceRecordId === sourceRecordId) this.catalogScanCache.delete(key);
    }
    this.revokeSourceCursors(sourceRecordId);
    this.media.unregisterSource(sourceRecordId);
  }
  purgeExpiredCursors() {
    const now = this.now();
    for (const [token, entry] of this.cursors) {
      if (now - entry.savedAt >= this.cursorTtlMs) this.cursors.delete(token);
    }
  }
  issueCursor(rawCursor, sourceRecordId, query, generation) {
    this.purgeExpiredCursors();
    let token = randomUUID();
    while (this.cursors.has(token)) token = randomUUID();
    this.cursors.set(token, {
      cursor: scopeCatalogCursor(rawCursor, sourceRecordId, query),
      generation,
      savedAt: this.now()
    });
    while (this.cursors.size > this.maxCursorEntries) {
      const oldest = this.cursors.keys().next().value;
      if (oldest === void 0) break;
      this.cursors.delete(oldest);
    }
    return token;
  }
  applyCursor(token, sourceRecordId, query, generation) {
    this.purgeExpiredCursors();
    const entry = this.cursors.get(token);
    if (entry === void 0 || entry.generation !== generation) {
      if (entry !== void 0) this.cursors.delete(token);
      throw new Error("catalog cursor is unknown or expired");
    }
    return applyScopedCatalogCursor(entry.cursor, sourceRecordId, query);
  }
  exposeSnapshot(snapshot, sourceRecordId, query, generation) {
    const rawCursor = snapshot.page.nextCursor;
    if (rawCursor === void 0) return snapshot;
    return {
      ...snapshot,
      page: {
        ...snapshot.page,
        nextCursor: this.issueCursor(rawCursor, sourceRecordId, query, generation)
      }
    };
  }
  revokeSourceCursors(sourceRecordId) {
    for (const [token, entry] of this.cursors) {
      if (entry.cursor.sourceRecordId === sourceRecordId) this.cursors.delete(token);
    }
  }
  resetCatalogScan(key, sourceRecordId) {
    const generation = (this.catalogScanGenerations.get(key) ?? 0) + 1;
    this.catalogScanGenerations.set(key, generation);
    this.catalogScanCache.delete(key);
    for (const controller of this.catalogScanControllers.get(key) ?? []) {
      controller.abort(new DOMException("Catalog refresh replaced this scan", "AbortError"));
    }
    this.catalogScanControllers.delete(key);
    this.revokeSourceCursors(sourceRecordId);
    return generation;
  }
  async scanCatalog(signal, options = {}) {
    if (options.force !== void 0 && typeof options.force !== "boolean") {
      throw new TypeError("invalid catalog scan options");
    }
    if (options.expectedSourceRecordId !== void 0 && (typeof options.expectedSourceRecordId !== "string" || options.expectedSourceRecordId.length === 0)) {
      throw new TypeError("invalid catalog scan options");
    }
    const scanQuery = normalizeCatalogQuery({
      limit: 100,
      ...options.locale === void 0 ? {} : { locale: options.locale }
    });
    const locale = scanQuery.locale;
    signal.throwIfAborted();
    const sourceGenerationsAtLoadStart = new Map(this.sourceGenerations);
    const records = [...await this.store.load()].sort((left, right) => left.order - right.order);
    signal.throwIfAborted();
    const source = records.find((record3) => record3.enabled);
    if (options.expectedSourceRecordId !== void 0 && source?.sourceRecordId !== options.expectedSourceRecordId) {
      throw new Error("catalog source is not active");
    }
    if (source === void 0) return void 0;
    const sourceGeneration = sourceGenerationsAtLoadStart.get(source.sourceRecordId) ?? 0;
    if ((this.sourceGenerations.get(source.sourceRecordId) ?? 0) !== sourceGeneration) {
      throw new Error("catalog source changed during scan setup");
    }
    const key = catalogScanKey(source.sourceRecordId, locale);
    let scanGate = this.catalogScanGates.get(key);
    if (scanGate === void 0) {
      scanGate = new ConcurrencyGate(1);
      this.catalogScanGates.set(key, scanGate);
    }
    const scanGeneration = options.force === true ? this.resetCatalogScan(key, source.sourceRecordId) : this.catalogScanGenerations.get(key) ?? 0;
    const cached2 = this.catalogScanCache.get(key);
    if (options.force !== true && cached2 !== void 0 && cached2.sourceGeneration === sourceGeneration && cached2.scanGeneration === scanGeneration && this.now() < cached2.expiresAt) return cachedScanView(cached2, "cached");
    if (cached2 !== void 0) {
      if (this.now() >= cached2.expiresAt) this.revokeSourceCursors(source.sourceRecordId);
      this.catalogScanCache.delete(key);
    }
    return await scanGate.run(signal, async () => await this.sourceConcurrency.run(signal, async () => {
      signal.throwIfAborted();
      if ((this.sourceGenerations.get(source.sourceRecordId) ?? 0) !== sourceGeneration || (this.catalogScanGenerations.get(key) ?? 0) !== scanGeneration) throw new Error("catalog source changed while waiting to scan");
      const cachedAfterWait = this.catalogScanCache.get(key);
      if (options.force !== true && cachedAfterWait !== void 0 && cachedAfterWait.sourceGeneration === sourceGeneration && cachedAfterWait.scanGeneration === scanGeneration && this.now() < cachedAfterWait.expiresAt) return cachedScanView(cachedAfterWait, "cached");
      if (cachedAfterWait !== void 0) {
        if (this.now() >= cachedAfterWait.expiresAt) this.revokeSourceCursors(source.sourceRecordId);
        this.catalogScanCache.delete(key);
      }
      const adapter = adapters.get(source.adapterId);
      if (adapter === void 0) throw new Error("catalog adapter unavailable");
      const invalidationController = new AbortController();
      const controllers = this.catalogScanControllers.get(key) ?? /* @__PURE__ */ new Set();
      controllers.add(invalidationController);
      this.catalogScanControllers.set(key, controllers);
      const sourceSignal = AbortSignal.any([signal, invalidationController.signal]);
      const delegate = this.adapterHttpClients.get(source.adapterId) ?? this.http;
      const http = {
        getJson: async (url, requestSignal, policy = {}) => await delegate.getJson(
          url,
          requestSignal,
          options.force === true ? { ...policy, cacheMode: "reload" } : policy
        )
      };
      const context = { signal: sourceSignal, source, http, media: this.media };
      try {
        let rawSnapshots;
        if (adapter.scanCatalog !== void 0) {
          rawSnapshots = await adapter.scanCatalog(scanQuery, context);
        } else {
          const pages = [];
          const cursors = /* @__PURE__ */ new Set();
          let query = scanQuery;
          while (true) {
            sourceSignal.throwIfAborted();
            if (pages.length >= MAX_CATALOG_PAGES) {
              throw new Error("catalog scan exceeded the page limit");
            }
            const snapshot = parseCatalogSnapshot(await adapter.fetch(query, context));
            pages.push(snapshot);
            const itemCount = pages.reduce((total, page) => total + page.items.length, 0);
            if (itemCount > MAX_CATALOG_ITEMS) {
              throw new Error("catalog scan exceeded the item limit");
            }
            const cursor = snapshot.page.nextCursor;
            if (cursor === void 0) break;
            if (cursors.has(cursor)) throw new Error("catalog scan cursor repeated");
            cursors.add(cursor);
            query = { ...scanQuery, cursor };
          }
          rawSnapshots = pages;
        }
        sourceSignal.throwIfAborted();
        if ((this.sourceGenerations.get(source.sourceRecordId) ?? 0) !== sourceGeneration || (this.catalogScanGenerations.get(key) ?? 0) !== scanGeneration) throw new Error("catalog source changed during scan");
        const complete = validateCompleteCatalogScan(source, rawSnapshots);
        const scannedAt = this.now();
        const entry = {
          sourceRecordId: source.sourceRecordId,
          sourceGeneration,
          scanGeneration,
          ...locale === void 0 ? {} : { locale },
          source: sourceView(source),
          snapshots: complete.snapshots,
          scannedAt,
          expiresAt: scannedAt + this.catalogScanCacheTtlMs,
          ...complete.providerRevision === void 0 ? {} : { providerRevision: complete.providerRevision },
          scanKey: randomUUID()
        };
        this.catalogScanCache.set(key, entry);
        for (const snapshot of entry.snapshots) {
          try {
            this.observeSnapshot?.(snapshot);
          } catch {
          }
        }
        return cachedScanView(entry, "fresh");
      } finally {
        controllers.delete(invalidationController);
        if (controllers.size === 0 && this.catalogScanControllers.get(key) === controllers) {
          this.catalogScanControllers.delete(key);
        }
      }
    }));
  }
  queryCatalog(index, value, scope) {
    if (scope !== void 0 && (typeof scope.sourceRecordId !== "string" || scope.sourceRecordId.length === 0 || scope.cursor !== void 0 && (typeof scope.cursor !== "string" || scope.cursor.length === 0))) {
      throw new Error("catalog source scope is invalid");
    }
    const baseQuery = normalizeCatalogQuery(value);
    if (baseQuery.cursor !== void 0) {
      throw new Error("catalog cursor requires an explicit source scope");
    }
    if (scope !== void 0 && index.source.sourceRecordId !== scope.sourceRecordId) {
      throw new Error("catalog source is not active");
    }
    if ((this.sourceGenerations.get(index.source.sourceRecordId) ?? 0) !== index.sourceGeneration) {
      throw new Error("catalog source is no longer active");
    }
    if (baseQuery.locale !== index.locale) throw new Error("catalog index locale does not match the query");
    const query = scope?.cursor === void 0 ? baseQuery : this.applyCursor(scope.cursor, scope.sourceRecordId, baseQuery, index.sourceGeneration);
    const filtered = sortCatalogItems(
      completeItems(index).filter((item) => matchesCatalogQuery(item, query)),
      query
    );
    const rawCursor = query.cursor ?? "0";
    if (!/^\d+$/u.test(rawCursor)) throw new Error("catalog cursor is invalid");
    const offset = Number(rawCursor);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > filtered.length) {
      throw new Error("catalog cursor is invalid");
    }
    const limit = Math.min(
      query.limit ?? 50,
      index.source.adapterId === DSH_1024STORE_ADAPTER_ID ? 50 : 100
    );
    const end = Math.min(offset + limit, filtered.length);
    const baseSnapshot = index.snapshots[0];
    if (baseSnapshot === void 0) return [{ source: index.source, stale: false }];
    const snapshot = parseCatalogSnapshot({
      schemaVersion: "1.0.0",
      source: baseSnapshot.source,
      items: filtered.slice(offset, end),
      page: {
        total: filtered.length,
        ...end < filtered.length ? { nextCursor: String(end) } : {}
      }
    });
    return [{
      source: index.source,
      snapshot: this.exposeSnapshot(snapshot, index.source.sourceRecordId, baseQuery, index.sourceGeneration),
      stale: false
    }];
  }
  async fetch(value, signal, scope) {
    const query = normalizeCatalogQuery(value);
    if (query.cursor !== void 0) throw new Error("catalog cursor requires an explicit source scope");
    const index = await this.scanCatalog(signal, {
      ...query.locale === void 0 ? {} : { locale: query.locale },
      ...scope === void 0 ? {} : { expectedSourceRecordId: scope.sourceRecordId }
    });
    signal.throwIfAborted();
    return index === void 0 ? [] : this.queryCatalog(index, query, scope);
  }
};

// src/catalog/source-store.ts
function normalizeActiveSourceRecords(records) {
  const ordered = [...records].sort((left, right) => left.order - right.order);
  const activeSourceRecordId = ordered.find((record3) => record3.enabled)?.sourceRecordId;
  return ordered.map((record3) => ({
    ...record3,
    enabled: record3.sourceRecordId === activeSourceRecordId
  }));
}
var SettingsCatalogSourceStore = class {
  constructor(scope) {
    this.scope = scope;
  }
  async load() {
    const records = [...this.scope.get().sources];
    validateLocalSourceRecords(records);
    return normalizeActiveSourceRecords(records);
  }
  async save(records) {
    const normalized = normalizeActiveSourceRecords(records);
    validateLocalSourceRecords(normalized);
    await this.scope.update({ sources: normalized });
  }
};

// src/media/ref.ts
var MARKET_MEDIA_ASSET_REF_PATTERN = /^mktimg_[A-Za-z0-9_-]{32}$/u;

// src/media/restricted-image.ts
import dns2 from "node:dns";
import https2 from "node:https";
import { BlockList as BlockList2, isIP as isIP2 } from "node:net";
var MAX_REDIRECTS2 = 2;
var MAX_BODY_BYTES2 = 2 * 1024 * 1024;
var CONNECT_TIMEOUT_MS2 = 8e3;
var FIRST_BYTE_TIMEOUT_MS2 = 12e3;
var TOTAL_TIMEOUT_MS2 = 3e4;
var SYNTHETIC_PROXY_NETWORK2 = "198.18.0.0";
var SYNTHETIC_PROXY_PREFIX2 = 15;
var MarketMediaError = class extends Error {
  constructor(code) {
    super(`market media request failed: ${code}`);
    this.code = code;
    this.name = "MarketMediaError";
  }
};
var blockedAddresses2 = new BlockList2();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3]
]) {
  blockedAddresses2.addSubnet(network, prefix, "ipv4");
}
var syntheticProxyAddresses2 = new BlockList2();
syntheticProxyAddresses2.addSubnet(SYNTHETIC_PROXY_NETWORK2, SYNTHETIC_PROXY_PREFIX2, "ipv4");
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8]
]) {
  blockedAddresses2.addSubnet(network, prefix, "ipv6");
}
function normalizeHostname(value) {
  if (value.length === 0 || value.includes("*") || value.includes("/") || value.includes("@")) {
    throw new MarketMediaError("invalid-candidate");
  }
  let parsed;
  try {
    parsed = new URL(`https://${value}`);
  } catch {
    throw new MarketMediaError("invalid-candidate");
  }
  if (parsed.hostname !== value.toLowerCase() || parsed.port || isIP2(parsed.hostname) !== 0) {
    throw new MarketMediaError("invalid-candidate");
  }
  return parsed.hostname;
}
function normalizeAllowedHostnames(values) {
  if (values.length === 0) throw new MarketMediaError("invalid-candidate");
  return [...new Set(values.map(normalizeHostname))].sort();
}
function validateRemoteImageUrl(value, allowedHostnames) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new MarketMediaError("invalid-candidate");
  }
  if (value.length > 2048 || url.protocol !== "https:" || url.username || url.password || url.hash || url.port && url.port !== "443" || !allowedHostnames.has(url.hostname.toLowerCase())) {
    throw new MarketMediaError("invalid-candidate");
  }
  return url;
}
function assertSafeAddress2(address, allowSyntheticProxyAddress = false) {
  const normalized = address.replace(/^\[|\]$/gu, "").split("%", 1)[0];
  const family = isIP2(normalized);
  const addressFamily = family === 4 ? "ipv4" : "ipv6";
  const allowedSyntheticAddress = allowSyntheticProxyAddress && family === 4 && syntheticProxyAddresses2.check(normalized, "ipv4");
  if (family === 0 || blockedAddresses2.check(normalized, addressFamily) && !allowedSyntheticAddress) {
    throw new MarketMediaError("blocked-address");
  }
  return family;
}
async function defaultLookupAddresses2(hostname) {
  const entries = await dns2.promises.lookup(hostname, { all: true, verbatim: true });
  return entries.map((entry) => ({
    address: entry.address,
    family: entry.family === 6 ? 6 : 4
  }));
}
async function resolvePinnedAddress2(hostname, lookupAddresses, syntheticProxyHostnames) {
  const literal = hostname.replace(/^\[|\]$/gu, "");
  if (isIP2(literal)) return { address: literal, family: assertSafeAddress2(literal) };
  let addresses;
  try {
    addresses = await lookupAddresses(hostname);
  } catch (cause) {
    if (cause instanceof MarketMediaError) throw cause;
    throw new MarketMediaError("response");
  }
  if (addresses.length === 0) throw new MarketMediaError("blocked-address");
  const allowSyntheticProxyAddress = syntheticProxyHostnames.has(hostname.toLowerCase());
  for (const entry of addresses) {
    if (entry.family !== assertSafeAddress2(entry.address, allowSyntheticProxyAddress)) {
      throw new MarketMediaError("blocked-address");
    }
  }
  return addresses[0];
}
function readBody2(response, maxBodyBytes) {
  return new Promise((resolve3, reject) => {
    const chunks = [];
    let size = 0;
    response.on("data", (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > maxBodyBytes) {
        response.destroy(new MarketMediaError("response"));
        return;
      }
      chunks.push(buffer);
    });
    response.once("end", () => resolve3(Buffer.concat(chunks)));
    response.once("error", reject);
  });
}
function requestOnce2(url, signal, pinned, maxBodyBytes) {
  return new Promise((resolve3, reject) => {
    let settled = false;
    let firstByteTimer;
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      if (firstByteTimer !== void 0) clearTimeout(firstByteTimer);
      callback();
    };
    const request = https2.request(url, {
      method: "GET",
      headers: {
        accept: "image/png,image/jpeg,image/webp",
        "accept-encoding": "identity",
        "user-agent": "dsh-community-market/0.1"
      },
      servername: url.hostname,
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      },
      signal,
      timeout: CONNECT_TIMEOUT_MS2
    }, (response) => {
      if (firstByteTimer !== void 0) clearTimeout(firstByteTimer);
      const contentLength = Number(response.headers["content-length"]);
      if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
        response.destroy();
        finish(() => reject(new MarketMediaError("response")));
        return;
      }
      void readBody2(response, maxBodyBytes).then(
        (body) => finish(() => resolve3({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body
        })),
        (cause) => finish(() => reject(cause))
      );
    });
    request.once("error", (cause) => finish(() => reject(cause)));
    request.once("timeout", () => request.destroy(new MarketMediaError("timeout")));
    firstByteTimer = setTimeout(() => request.destroy(new MarketMediaError("timeout")), FIRST_BYTE_TIMEOUT_MS2);
    request.end();
  });
}
function parseContentType(value) {
  const normalized = Array.isArray(value) ? value[0] : value;
  const match = normalized?.trim().toLowerCase().match(/^(image\/(?:png|jpeg|webp))(?:;|$)/u);
  if (match?.[1] === "image/png" || match?.[1] === "image/jpeg" || match?.[1] === "image/webp") {
    return match[1];
  }
  throw new MarketMediaError("response");
}
async function fetchWithRedirects(start, allowedHostnames, signal, lookupAddresses, request, maxBodyBytes, syntheticProxyHostnames, redirectCount = 0) {
  if (signal.aborted) throw new MarketMediaError("timeout");
  const url = validateRemoteImageUrl(start, allowedHostnames);
  const pinned = await resolvePinnedAddress2(url.hostname, lookupAddresses, syntheticProxyHostnames);
  if (signal.aborted) throw new MarketMediaError("timeout");
  let response;
  try {
    response = await request(url, signal, pinned);
  } catch (cause) {
    if (cause instanceof MarketMediaError) throw cause;
    throw new MarketMediaError("response");
  }
  if (response.body.byteLength > maxBodyBytes) throw new MarketMediaError("response");
  const status = response.statusCode;
  if (status >= 300 && status < 400) {
    if (redirectCount >= MAX_REDIRECTS2) throw new MarketMediaError("redirect");
    const location = response.headers.location;
    if (location === void 0) throw new MarketMediaError("redirect");
    let redirectUrl;
    try {
      redirectUrl = new URL(location, url).href;
    } catch {
      throw new MarketMediaError("redirect");
    }
    return await fetchWithRedirects(
      redirectUrl,
      allowedHostnames,
      signal,
      lookupAddresses,
      request,
      maxBodyBytes,
      syntheticProxyHostnames,
      redirectCount + 1
    );
  }
  if (status < 200 || status >= 300) throw new MarketMediaError("http");
  const encoding = response.headers["content-encoding"];
  if (encoding !== void 0 && encoding !== "identity") throw new MarketMediaError("response");
  return {
    body: response.body,
    contentType: parseContentType(response.headers["content-type"]),
    finalUrl: url.href
  };
}
function createRestrictedImageFetcher(options = {}) {
  const lookupAddresses = options.lookupAddresses ?? defaultLookupAddresses2;
  const maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES2;
  const request = options.request ?? (async (url, signal, pinned) => await requestOnce2(url, signal, pinned, maxBodyBytes));
  const totalTimeoutMs = options.totalTimeoutMs ?? TOTAL_TIMEOUT_MS2;
  const syntheticProxyHostnames = new Set(
    (options.syntheticProxyHostnames ?? []).map(normalizeHostname)
  );
  return async (candidate, signal) => {
    const allowedHostnames = new Set(normalizeAllowedHostnames(candidate.allowedHostnames));
    validateRemoteImageUrl(candidate.remoteUrl, allowedHostnames);
    if (signal.aborted) throw new MarketMediaError("timeout");
    const controller = new AbortController();
    let rejectAbort;
    const aborted = new Promise((_resolve, reject) => {
      rejectAbort = reject;
    });
    const onAbort = () => {
      const cause = signal.reason ?? new DOMException("The operation was aborted", "AbortError");
      controller.abort(cause);
      rejectAbort(cause);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    let timer;
    const timedOut = new Promise((_resolve, reject) => {
      timer = setTimeout(() => {
        const cause = new MarketMediaError("timeout");
        controller.abort(cause);
        reject(cause);
      }, totalTimeoutMs);
    });
    const operation = fetchWithRedirects(
      candidate.remoteUrl,
      allowedHostnames,
      controller.signal,
      lookupAddresses,
      request,
      maxBodyBytes,
      syntheticProxyHostnames
    );
    try {
      return await Promise.race([operation, aborted, timedOut]);
    } catch (cause) {
      if (cause instanceof MarketMediaError) throw cause;
      if (signal.aborted) throw cause;
      throw new MarketMediaError("response");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  };
}

// src/media/service.ts
import { createHash, randomBytes } from "node:crypto";

// sharp-shim.mjs
import { createRequire as createRequire2 } from "node:module";
import { dirname, join, resolve } from "node:path";
var cached;
function loadSharp() {
  if (cached !== void 0) return cached;
  const attempts = [() => createRequire2(import.meta.url)("sharp")];
  const entry = process.argv[1];
  if (typeof entry === "string" && entry !== "") {
    attempts.push(() => createRequire2(join(dirname(resolve(entry)), "package.json"))("sharp"));
  }
  let lastError;
  for (const attempt of attempts) {
    try {
      cached = attempt();
      return cached;
    } catch (cause) {
      lastError = cause;
    }
  }
  throw lastError ?? new Error("sharp is not available in this desktop runtime");
}
function sharp(input, options) {
  return loadSharp()(input, options);
}

// src/media/normalize-image.ts
var OUTPUT_SIZE = 128;
var MAX_INPUT_PIXELS = 16 * 1024 * 1024;
var ALLOWED_FORMATS = /* @__PURE__ */ new Set(["jpeg", "png", "webp"]);
var FORMAT_BY_CONTENT_TYPE = {
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp"
};
async function normalizeMarketImage(image) {
  try {
    const decoder = sharp(image.body, {
      animated: false,
      failOn: "warning",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true
    });
    const metadata = await decoder.metadata();
    if (metadata.format === void 0 || !ALLOWED_FORMATS.has(metadata.format) || metadata.format !== FORMAT_BY_CONTENT_TYPE[image.contentType] || metadata.width === void 0 || metadata.height === void 0 || metadata.width <= 0 || metadata.height <= 0 || metadata.width * metadata.height > MAX_INPUT_PIXELS || (metadata.pages ?? 1) !== 1) {
      throw new MarketMediaError("invalid-image");
    }
    return await decoder.rotate().resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    }).png({ compressionLevel: 9 }).toBuffer();
  } catch (cause) {
    if (cause instanceof MarketMediaError) throw cause;
    throw new MarketMediaError("invalid-image");
  }
}

// src/media/service.ts
var DEFAULT_CACHE_TTL_MS = 24 * 60 * 60 * 1e3;
var DEFAULT_MAX_CACHED_ASSETS = 256;
var DEFAULT_MAX_REGISTERED_ASSETS = 4096;
var DEFAULT_MAX_CONCURRENT_RESOLUTIONS = 2;
function canonicalCandidate(candidate) {
  if (candidate.role !== "plugin-icon" && candidate.role !== "publisher-avatar" || candidate.sourceRecordId.length === 0 || candidate.sourceRecordId.length > 256 || candidate.itemId.length === 0 || candidate.itemId.length > 512 || candidate.alt !== void 0 && candidate.alt.length > 1024) {
    throw new TypeError("invalid market media candidate");
  }
  const allowedHostnames = normalizeAllowedHostnames(candidate.allowedHostnames);
  const remoteUrl = validateRemoteImageUrl(candidate.remoteUrl, new Set(allowedHostnames)).href;
  return {
    remoteUrl,
    role: candidate.role,
    ...candidate.alt === void 0 ? {} : { alt: candidate.alt },
    sourceRecordId: candidate.sourceRecordId,
    itemId: candidate.itemId,
    allowedHostnames
  };
}
function candidateKey(candidate) {
  return createHash("sha256").update(JSON.stringify(candidate)).digest("hex");
}
function awaitWithSignal(promise, signal) {
  const abortReason = () => signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  if (signal.aborted) return Promise.reject(abortReason());
  return new Promise((resolve3, reject) => {
    const onAbort = () => reject(abortReason());
    signal.addEventListener("abort", onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve3(value);
      },
      (cause) => {
        signal.removeEventListener("abort", onAbort);
        reject(cause);
      }
    );
  });
}
function createMarketMediaService(options = {}) {
  const fetchImage = options.fetchImage ?? createRestrictedImageFetcher();
  const normalizeImage = options.normalizeImage ?? normalizeMarketImage;
  const now = options.now ?? Date.now;
  const cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS;
  const maxCachedAssets = options.maxCachedAssets ?? DEFAULT_MAX_CACHED_ASSETS;
  const maxRegisteredAssets = options.maxRegisteredAssets ?? DEFAULT_MAX_REGISTERED_ASSETS;
  const maxConcurrentResolutions = options.maxConcurrentResolutions ?? DEFAULT_MAX_CONCURRENT_RESOLUTIONS;
  if (!Number.isSafeInteger(maxCachedAssets) || maxCachedAssets < 0 || !Number.isSafeInteger(maxRegisteredAssets) || maxRegisteredAssets < 1 || !Number.isSafeInteger(maxConcurrentResolutions) || maxConcurrentResolutions < 1 || cacheTtlMs < 0) {
    throw new TypeError("invalid market media cache options");
  }
  const createAssetRef = options.createAssetRef ?? (() => `mktimg_${randomBytes(24).toString("base64url")}`);
  const assets = /* @__PURE__ */ new Map();
  const candidateRefs = /* @__PURE__ */ new Map();
  let disposed = false;
  let activeResolutions = 0;
  const resolutionWaiters = [];
  const grantResolutionSlots = () => {
    while (activeResolutions < maxConcurrentResolutions && resolutionWaiters.length > 0) {
      const waiter = resolutionWaiters.shift();
      waiter.signal.removeEventListener("abort", waiter.onAbort);
      if (waiter.signal.aborted) continue;
      activeResolutions += 1;
      waiter.grant();
    }
  };
  const acquireResolutionSlot = async (signal) => {
    signal.throwIfAborted();
    if (activeResolutions < maxConcurrentResolutions) {
      activeResolutions += 1;
    } else {
      await new Promise((grant, reject) => {
        const waiter = {
          signal,
          grant,
          reject,
          onAbort: () => {
            const index = resolutionWaiters.indexOf(waiter);
            if (index >= 0) resolutionWaiters.splice(index, 1);
            reject(signal.reason ?? new DOMException("The operation was aborted", "AbortError"));
          }
        };
        signal.addEventListener("abort", waiter.onAbort, { once: true });
        resolutionWaiters.push(waiter);
      });
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      activeResolutions -= 1;
      grantResolutionSlots();
    };
  };
  const resolveBounded = async (signal, operation) => {
    const release = await acquireResolutionSlot(signal);
    try {
      signal.throwIfAborted();
      return await operation();
    } finally {
      release();
    }
  };
  const deleteAsset = (assetRef, entry) => {
    entry.inFlightController?.abort(new DOMException("Market media registration was revoked", "AbortError"));
    assets.delete(assetRef);
    candidateRefs.delete(candidateKey(entry.candidate));
  };
  const makeRegistrationRoom = () => {
    if (assets.size < maxRegisteredAssets) return;
    const oldest = [...assets.entries()].filter(([, entry]) => entry.inFlight === void 0).sort((left, right) => left[1].lastUsedAt - right[1].lastUsedAt)[0];
    if (oldest === void 0) throw new Error("market media registration limit reached");
    deleteAsset(oldest[0], oldest[1]);
  };
  const evictExcessCache = () => {
    const cached2 = [...assets.values()].filter((entry) => entry.cachedAt !== void 0).sort((left, right) => left.cachedAt - right.cachedAt);
    while (cached2.length > maxCachedAssets) {
      const entry = cached2.shift();
      delete entry.cached;
      delete entry.cachedAt;
    }
  };
  return {
    register(rawCandidate) {
      if (disposed) throw new Error("market media service is disposed");
      const candidate = canonicalCandidate(rawCandidate);
      const key = candidateKey(candidate);
      const existingRef = candidateRefs.get(key);
      if (existingRef !== void 0) {
        const existing = assets.get(existingRef);
        if (existing !== void 0) existing.lastUsedAt = now();
        return existingRef;
      }
      makeRegistrationRoom();
      let assetRef = createAssetRef();
      if (!MARKET_MEDIA_ASSET_REF_PATTERN.test(assetRef)) {
        throw new TypeError("invalid generated market media asset reference");
      }
      while (assets.has(assetRef)) assetRef = `mktimg_${randomBytes(24).toString("base64url")}`;
      assets.set(assetRef, { candidate, lastUsedAt: now() });
      candidateRefs.set(key, assetRef);
      return assetRef;
    },
    async resolve(assetRef, signal) {
      if (disposed) return void 0;
      if (!MARKET_MEDIA_ASSET_REF_PATTERN.test(assetRef)) return void 0;
      const entry = assets.get(assetRef);
      if (entry === void 0) return void 0;
      entry.lastUsedAt = now();
      if (entry.cached !== void 0 && entry.cachedAt !== void 0 && now() - entry.cachedAt < cacheTtlMs) {
        return entry.cached;
      }
      if (entry.inFlight === void 0) {
        const inFlightController = new AbortController();
        entry.inFlightController = inFlightController;
        entry.inFlight = resolveBounded(inFlightController.signal, async () => {
          const rawImage = await fetchImage(entry.candidate, inFlightController.signal);
          const body = await normalizeImage(rawImage);
          const digest = createHash("sha256").update(body).digest("base64url");
          return {
            body,
            contentType: "image/png",
            etag: `"sha256-${digest}"`
          };
        });
        const inFlight = entry.inFlight;
        void inFlight.then(
          (asset) => {
            if (disposed || assets.get(assetRef) !== entry) return;
            entry.cached = asset;
            entry.cachedAt = now();
            evictExcessCache();
          },
          () => {
          }
        ).then(() => {
          if (entry.inFlight === inFlight) {
            delete entry.inFlight;
            delete entry.inFlightController;
          }
        });
      }
      return await awaitWithSignal(entry.inFlight, signal);
    },
    unregisterSource(sourceRecordId) {
      for (const [assetRef, entry] of assets) {
        if (entry.candidate.sourceRecordId !== sourceRecordId) continue;
        deleteAsset(assetRef, entry);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [assetRef, entry] of assets) deleteAsset(assetRef, entry);
      for (const waiter of resolutionWaiters.splice(0)) {
        waiter.signal.removeEventListener("abort", waiter.onAbort);
        waiter.reject(new DOMException("Market media service was disposed", "AbortError"));
      }
      candidateRefs.clear();
    }
  };
}

// src/install/service.ts
import { randomBytes as randomBytes2, randomUUID as randomUUID2 } from "node:crypto";
import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, join as join2, relative, resolve as resolve2 } from "node:path";
import { gt, prerelease, satisfies, valid } from "semver";
import { parse as parseYaml } from "yaml";

// src/install/manual.ts
var NPM_PACKAGE_PATTERN3 = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
var STABLE_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
function identity(item) {
  return {
    sourceRecordId: item.provenance.sourceRecordId,
    providerId: item.provenance.providerId,
    itemId: item.id
  };
}
function manualInstallHint(item) {
  if (item.package?.registry === "npm" && NPM_PACKAGE_PATTERN3.test(item.package.name) && typeof item.latestVersion === "string" && STABLE_VERSION_PATTERN.test(item.latestVersion)) {
    return {
      ...identity(item),
      kind: "npm",
      mutable: false,
      desktopVerification: "not-verified",
      displayCommand: `dsh plugin add --save-exact ${item.package.name}@${item.latestVersion}`
    };
  }
  return void 0;
}
function manualInstallHints(items) {
  return items.flatMap((item) => {
    const hint = manualInstallHint(item);
    return hint === void 0 ? [] : [hint];
  });
}

// src/install/service.ts
var NPM_REGISTRY_ORIGIN = "https://registry.npmjs.org";
var NPM_REGISTRY = `${NPM_REGISTRY_ORIGIN}/`;
var PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/u;
var MAX_MANIFEST_BYTES = 1024 * 1024;
var MAX_LOCKFILE_BYTES = 32 * 1024 * 1024;
var INSTALL_INTENT_TTL_MS = 5 * 60 * 1e3;
var CANDIDATE_TTL_MS = 30 * 60 * 1e3;
var MAX_INTENTS = 256;
var MAX_CANDIDATES = 1e4;
var MAX_RECEIPTS = 512;
var LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall", "prepare"];
var BLOCKED_PRODUCT_PACKAGES = /* @__PURE__ */ new Set(["dsh-plugin-desktop", "dsh-community-market"]);
var DSH_RUNTIME_VERSION = "0.1.1-rc.2";
var CORDIS_RUNTIME_VERSION = "4.0.1";
var NODE_RUNTIME_VERSION = "24.18.1";
var MarketInstallError = class extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "MarketInstallError";
  }
};
// --- issue #170: surface the package manager's own failure reason -------------
// Upstream collapsed every non-zero pnpm exit into one fixed sentence while
// runPlugin() drained the child's output into the void, so a profile with an
// unresolvable leftover dependency ([ERR_PNPM_FETCH_404]) and a missing pnpm
// binary looked identical to the user. The desktop bridge
// (dsh-market-desktop-bridge) now reports `stdoutTail` / `stderrTail` /
// `spawnError` on the settled outcome; these helpers bound that text and append
// it to the message, which travels verbatim through sendInstallError() -> the
// market client's operationErrorMessage().
var MAX_PM_DETAIL_CHARS = 900;
var PM_DETAIL_LINES = 6;
var PM_LINE_CHARS = 200;
var ANSI_ESCAPE_PATTERN = /\u001B\[[0-9;?]*[ -/]*[@-~]/gu;
// 噪声行（进度 / 供应链策略提示 / 分隔线）。前两项做子串匹配：pnpm 会在行首加
// 状态图标（非 ASCII 甚至乱码），行首锚定的 ^ 会漏匹配。
var PM_PROGRESS_NOISE = /(?:progress:|lockfile passes|packages?\s*[:+]|^\s*[-_=]{4,}\s*$)/iu;
function packageManagerText(value) {
  if (typeof value !== "string") return "";
  const lines = [];
  for (const raw of value.replace(ANSI_ESCAPE_PATTERN, "").split(/\r?\n/u)) {
    const line = raw.trim();
    if (line === "" || PM_PROGRESS_NOISE.test(line)) continue;
    lines.push(line.length > PM_LINE_CHARS ? `${line.slice(0, PM_LINE_CHARS)}...` : line);
  }
  return lines.slice(-PM_DETAIL_LINES).join(" | ");
}
function packageManagerDetail(outcome) {
  if (outcome === null || typeof outcome !== "object") return "";
  // 三路合并（spawnError → stderr → stdout，送进同一个行筛选器取尾部 N 行）。
  // 实测 pnpm 11 经 `dsh plugin`（stdio: "inherit"）把 [ERR_PNPM_FETCH_404] 打在
  // stdout，只取 stderr 会丢掉根因（issue #170）。
  const parts = [];
  if (typeof outcome.spawnError === "string" && outcome.spawnError !== "") parts.push(outcome.spawnError);
  if (typeof outcome.stderrTail === "string" && outcome.stderrTail !== "") parts.push(outcome.stderrTail);
  if (typeof outcome.stdoutTail === "string" && outcome.stdoutTail !== "") parts.push(outcome.stdoutTail);
  const detail = packageManagerText(parts.join("\n"));
  return detail.length > MAX_PM_DETAIL_CHARS ? detail.slice(-MAX_PM_DETAIL_CHARS) : detail;
}
function packageManagerStatus(outcome) {
  if (outcome === null || typeof outcome !== "object") return "";
  if (typeof outcome.signal === "string" && outcome.signal !== "") return ` (${outcome.signal})`;
  return typeof outcome.exitCode === "number" && outcome.exitCode !== 0 ? ` (exit ${outcome.exitCode})` : "";
}
function packageManagerFailure(base, outcome) {
  const status = packageManagerStatus(outcome);
  const detail = packageManagerDetail(outcome);
  return detail === "" ? `${base}${status}` : `${base}${status} ${detail}`;
}
function packageManagerError(code, base, cause) {
  if (cause instanceof Error && cause.name === "AbortError") return new MarketInstallError(code, base);
  const detail = packageManagerDetail({
    spawnError: cause instanceof Error ? cause.message : typeof cause === "string" ? cause : ""
  });
  return new MarketInstallError(code, detail === "" ? base : `${base} ${detail}`);
}
function stableExactVersion(value) {
  return typeof value === "string" && valid(value, { loose: false }) === value && prerelease(value, { loose: false }) === null;
}
function safePackageName(value) {
  return typeof value === "string" && PACKAGE_NAME_PATTERN.test(value);
}
function marketManagedPackage(value) {
  return !BLOCKED_PRODUCT_PACKAGES.has(value);
}
function candidateKey2(sourceRecordId, itemId) {
  return `${sourceRecordId}\0${itemId}`;
}
function opaqueToken() {
  return randomBytes2(32).toString("base64url");
}
function own(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}
function sha512Integrity(value) {
  if (typeof value !== "string" || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value)) return false;
  const encoded = value.slice("sha512-".length);
  const digest = Buffer.from(encoded, "base64");
  return digest.byteLength === 64 && digest.toString("base64") === encoded;
}
function safeBundlePatch(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || value.includes("\0")) return false;
  const path = value.startsWith("./") ? value.slice(2) : value;
  return path.length > 0 && !path.startsWith("/") && !path.includes("\\") && path.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== ".." && !segment.includes(":"));
}
function npmRepository(value) {
  const repository = typeof value === "string" ? { url: value } : value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  if (repository === void 0 || typeof repository.url !== "string") return void 0;
  const rawUrl = repository.url.startsWith("git+") ? repository.url.slice(4) : repository.url;
  if (!rawUrl.startsWith("https://")) return void 0;
  try {
    return normalizeRepositoryIdentity({
      url: rawUrl,
      ...typeof repository.directory === "string" ? { subdirectory: repository.directory } : {}
    });
  } catch {
    return void 0;
  }
}
function assertRuntimeCompatibility(manifest) {
  const accepts = (version, range) => {
    if (typeof range !== "string") return false;
    try {
      return satisfies(version, range, { includePrerelease: true });
    } catch {
      return false;
    }
  };
  for (const field of ["dependencies", "peerDependencies", "optionalDependencies"]) {
    const dependencies = manifest[field];
    if (dependencies === void 0) continue;
    if (dependencies === null || typeof dependencies !== "object" || Array.isArray(dependencies)) {
      throw new MarketInstallError("verification-failed", "The npm package dependency metadata was invalid.");
    }
    for (const [name2, range] of Object.entries(dependencies)) {
      if (name2 === "cordis") {
        throw new MarketInstallError(
          "verification-failed",
          "The plugin package depends on the legacy Cordis runtime and is not compatible with DSH Desktop."
        );
      }
      const runtimeVersion = name2 === "@deepseek-ai/cordis" ? CORDIS_RUNTIME_VERSION : name2.startsWith("@deepseek-ai/dsh") ? DSH_RUNTIME_VERSION : void 0;
      if (runtimeVersion === void 0) continue;
      if (!accepts(runtimeVersion, range)) {
        throw new MarketInstallError(
          "verification-failed",
          "The plugin package is not compatible with this DSH Desktop runtime."
        );
      }
    }
  }
  const engines = manifest.engines;
  if (engines === void 0) return;
  if (engines === null || typeof engines !== "object" || Array.isArray(engines)) {
    throw new MarketInstallError("verification-failed", "The npm package engine metadata was invalid.");
  }
  const nodeRange = engines.node;
  if (nodeRange !== void 0 && !accepts(NODE_RUNTIME_VERSION, nodeRange)) {
    throw new MarketInstallError(
      "verification-failed",
      "The plugin package does not support the Node.js runtime bundled with DSH Desktop."
    );
  }
}
function officialNpmTarball(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.origin === NPM_REGISTRY_ORIGIN && url.protocol === "https:" && !url.username && !url.password && !url.hash && url.pathname.endsWith(".tgz");
  } catch {
    return false;
  }
}
function createNpmRegistryVerifier(http) {
  return {
    async verify(candidate, signal) {
      if (!safePackageName(candidate.packageName) || !marketManagedPackage(candidate.packageName) || !stableExactVersion(candidate.version)) {
        throw new MarketInstallError("verification-failed", "The plugin package target is invalid.");
      }
      const url = `${NPM_REGISTRY_ORIGIN}/${encodeURIComponent(candidate.packageName)}/${encodeURIComponent(candidate.version)}`;
      let response;
      try {
        response = await http.getJson(url, signal, { allowedOrigin: NPM_REGISTRY_ORIGIN });
      } catch {
        throw new MarketInstallError("verification-failed", "The plugin package could not be verified with npm.");
      }
      let finalOrigin;
      try {
        finalOrigin = new URL(response.finalUrl).origin;
      } catch {
        throw new MarketInstallError("verification-failed", "The npm verification response was invalid.");
      }
      const metadata = response.value;
      if (finalOrigin !== NPM_REGISTRY_ORIGIN || metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
        throw new MarketInstallError("verification-failed", "The npm verification response was invalid.");
      }
      const manifest = metadata;
      if (manifest.name !== candidate.packageName || manifest.version !== candidate.version) {
        throw new MarketInstallError("verification-failed", "The npm package identity did not match the catalog.");
      }
      assertRuntimeCompatibility(manifest);
      if (own(manifest, "deprecated")) {
        throw new MarketInstallError("verification-failed", "Deprecated plugin packages cannot be installed from the market.");
      }
      const scripts = manifest.scripts;
      if (scripts !== void 0 && (scripts === null || typeof scripts !== "object" || Array.isArray(scripts) || LIFECYCLE_SCRIPTS.some((script) => own(scripts, script)))) {
        throw new MarketInstallError("verification-failed", "Plugin packages with install lifecycle scripts are not supported.");
      }
      const repository = npmRepository(manifest.repository);
      if (repository === void 0 || repository.url !== candidate.repository.url || repository.subdirectory !== candidate.repository.subdirectory) {
        throw new MarketInstallError("verification-failed", "The npm package repository did not match the catalog.");
      }
      const dist = manifest.dist;
      const dsh = manifest.dsh;
      const bundle = dsh !== null && typeof dsh === "object" && !Array.isArray(dsh) ? dsh.bundle : void 0;
      const patch = bundle !== null && typeof bundle === "object" && !Array.isArray(bundle) ? bundle.patch : void 0;
      const integrity = dist !== null && typeof dist === "object" && !Array.isArray(dist) ? dist.integrity : void 0;
      const tarball = dist !== null && typeof dist === "object" && !Array.isArray(dist) ? dist.tarball : void 0;
      if (!sha512Integrity(integrity) || !officialNpmTarball(tarball) || !safeBundlePatch(patch)) {
        throw new MarketInstallError("verification-failed", "The npm package is missing a verifiable DSH bundle artifact.");
      }
      return { integrity, bundlePatch: patch, tarball };
    }
  };
}
function record2(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
}
async function readManifest(path) {
  const body = await readFile(path);
  if (body.byteLength > MAX_MANIFEST_BYTES) throw new Error("manifest too large");
  const value = JSON.parse(body.toString("utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid manifest");
  return value;
}
function profileDependency(manifest, packageName) {
  if (manifest.dependencies === null || typeof manifest.dependencies !== "object" || Array.isArray(manifest.dependencies)) {
    return void 0;
  }
  const value = manifest.dependencies[packageName];
  return typeof value === "string" ? value : void 0;
}
function profileBundles(manifest) {
  if (manifest.dsh === null || typeof manifest.dsh !== "object" || Array.isArray(manifest.dsh)) return [];
  const profile = manifest.dsh.profile;
  if (profile === null || typeof profile !== "object" || Array.isArray(profile)) return [];
  const bundles = profile.bundles;
  return Array.isArray(bundles) && bundles.every((value) => typeof value === "string") ? bundles : [];
}
function profileReferencesPlugin(manifest, packageName) {
  return profileDependency(manifest, packageName) !== void 0 || profileBundles(manifest).includes(packageName);
}
async function profileHasPluginReference(profile, packageName) {
  return profileReferencesPlugin(await readManifest(join2(profile.dir, "package.json")), packageName);
}
function bundlePatch(manifest) {
  if (manifest.dsh === null || typeof manifest.dsh !== "object" || Array.isArray(manifest.dsh)) return void 0;
  const bundle = manifest.dsh.bundle;
  if (bundle === null || typeof bundle !== "object" || Array.isArray(bundle)) return void 0;
  const patch = bundle.patch;
  return typeof patch === "string" && patch.length > 0 ? patch : void 0;
}
function packageSegments(packageName) {
  return packageName.startsWith("@") ? packageName.split("/") : [packageName];
}
function containedPath(parent, child) {
  const path = relative(parent, child);
  return path === "" || path !== ".." && !path.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && !isAbsolute(path);
}
function supportedLockfileVersion(value) {
  if (typeof value !== "string" && typeof value !== "number") return false;
  const match = /^(\d+)(?:\.\d+)?$/u.exec(String(value));
  return match !== null && (match[1] === "9" || match[1] === "11");
}
function exactLockResolution(value, version) {
  return typeof value === "string" && (value === version || value.startsWith(`${version}(`));
}
function lockEntry(recordValue, keys) {
  for (const key of keys) {
    if (!own(recordValue, key)) continue;
    return record2(recordValue[key]);
  }
  return void 0;
}
async function readProfileLock(profile) {
  const body = await readFile(join2(profile.dir, "pnpm-lock.yaml"));
  if (body.byteLength > MAX_LOCKFILE_BYTES) throw new Error("lockfile too large");
  const lockfile = record2(parseYaml(body.toString("utf8")));
  if (lockfile === void 0 || !supportedLockfileVersion(lockfile.lockfileVersion)) {
    throw new Error("unsupported lockfile");
  }
  return lockfile;
}
function assertProfileLockRecord(lockfile, packageName, version, expectedIntegrity) {
  const importer = record2(record2(lockfile.importers)?.["."]);
  const dependencies = record2(importer?.dependencies);
  const dependency = dependencies !== void 0 && own(dependencies, packageName) ? record2(dependencies[packageName]) : void 0;
  if (dependency?.specifier !== version || !exactLockResolution(dependency.version, version)) {
    throw new Error("lockfile dependency mismatch");
  }
  const resolvedVersion = dependency.version;
  const baseKey = `${packageName}@${version}`;
  const resolvedKey = `${packageName}@${resolvedVersion}`;
  const packageKeys = [.../* @__PURE__ */ new Set([baseKey, `/${baseKey}`, resolvedKey, `/${resolvedKey}`])];
  const packageSnapshot = lockEntry(record2(lockfile.packages) ?? {}, packageKeys);
  const resolution = record2(packageSnapshot?.resolution);
  if (resolution?.integrity !== expectedIntegrity) throw new Error("lockfile integrity mismatch");
  const snapshot = lockEntry(record2(lockfile.snapshots) ?? {}, [resolvedKey, `/${resolvedKey}`]);
  if (snapshot === void 0) throw new Error("lockfile snapshot missing");
}
async function loadInstalledProfileSnapshot(profile) {
  const nodeModules = resolve2(profile.dir, "node_modules");
  const [manifest, lockfile, resolvedNodeModules] = await Promise.all([
    readManifest(join2(profile.dir, "package.json")),
    readProfileLock(profile),
    realpath(nodeModules)
  ]);
  return { manifest, lockfile, nodeModules, resolvedNodeModules };
}
async function assertInstalledBundleFromSnapshot(snapshot, packageName, version, expectedPatch, expectedIntegrity) {
  if (profileDependency(snapshot.manifest, packageName) !== version) throw new Error("dependency mismatch");
  if (!profileBundles(snapshot.manifest).includes(packageName)) throw new Error("bundle missing");
  const packageDir = join2(snapshot.nodeModules, ...packageSegments(packageName));
  const resolvedPackageDir = await realpath(packageDir);
  if (!containedPath(snapshot.resolvedNodeModules, resolvedPackageDir)) throw new Error("package escaped profile");
  const manifest = await readManifest(join2(resolvedPackageDir, "package.json"));
  if (manifest.name !== packageName || manifest.version !== version) throw new Error("installed package mismatch");
  const patch = bundlePatch(manifest);
  if (patch === void 0 || !safeBundlePatch(patch) || patch !== expectedPatch) {
    throw new Error("bundle patch missing");
  }
  const patchPath = resolve2(resolvedPackageDir, patch);
  if (!containedPath(resolvedPackageDir, patchPath)) throw new Error("bundle patch invalid");
  const resolvedPatchPath = await realpath(patchPath);
  if (!containedPath(resolvedPackageDir, resolvedPatchPath) || !(await stat(resolvedPatchPath)).isFile()) {
    throw new Error("bundle patch invalid");
  }
  assertProfileLockRecord(snapshot.lockfile, packageName, version, expectedIntegrity);
}
async function assertInstalledBundle(profile, packageName, version, expectedPatch, expectedIntegrity) {
  await assertInstalledBundleFromSnapshot(
    await loadInstalledProfileSnapshot(profile),
    packageName,
    version,
    expectedPatch,
    expectedIntegrity
  );
}
async function assertNotInstalled(profile, packageName) {
  const profileManifest = await readManifest(join2(profile.dir, "package.json"));
  if (profileReferencesPlugin(profileManifest, packageName)) {
    throw new MarketInstallError("conflict", "This plugin is already managed by the active profile.");
  }
}
async function assertRemoved(profile, packageName) {
  const profileManifest = await readManifest(join2(profile.dir, "package.json"));
  if (profileReferencesPlugin(profileManifest, packageName)) {
    throw new Error("plugin remains in profile");
  }
}
function validReceipt(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const receipt = value;
  return typeof receipt.receiptId === "string" && receipt.receiptId.length >= 16 && receipt.receiptId.length <= 128 && typeof receipt.profileName === "string" && receipt.profileName.length >= 1 && receipt.profileName.length <= 120 && safePackageName(receipt.packageName) && marketManagedPackage(receipt.packageName) && stableExactVersion(receipt.version) && sha512Integrity(receipt.integrity) && safeBundlePatch(receipt.bundlePatch) && typeof receipt.sourceRecordId === "string" && receipt.sourceRecordId.length >= 1 && receipt.sourceRecordId.length <= 200 && typeof receipt.providerId === "string" && receipt.providerId.length >= 1 && receipt.providerId.length <= 200 && typeof receipt.itemId === "string" && receipt.itemId.length >= 1 && receipt.itemId.length <= 200 && typeof receipt.displayName === "string" && receipt.displayName.length >= 1 && receipt.displayName.length <= 240 && typeof receipt.installedAt === "string" && !Number.isNaN(Date.parse(receipt.installedAt));
}
var MarketInstallService = class {
  constructor(scope, currentProfile, pnpm, verifier, options = {}) {
    this.scope = scope;
    this.currentProfile = currentProfile;
    this.pnpm = pnpm;
    this.verifier = verifier;
    this.now = options.now ?? Date.now;
    this.intentTtlMs = options.intentTtlMs ?? INSTALL_INTENT_TTL_MS;
    this.candidateTtlMs = options.candidateTtlMs ?? CANDIDATE_TTL_MS;
    this.maxIntents = options.maxIntents ?? MAX_INTENTS;
    this.maxCandidates = options.maxCandidates ?? MAX_CANDIDATES;
    this.disabledPackageNames = options.disabledPackageNames ?? (() => []);
    this.assertInstalled = options.assertInstalled ?? assertInstalledBundle;
    for (const [label, value] of [
      ["intent TTL", this.intentTtlMs],
      ["candidate TTL", this.candidateTtlMs],
      ["intent limit", this.maxIntents],
      ["candidate limit", this.maxCandidates]
    ]) {
      if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(`invalid market install ${label}`);
    }
  }
  candidates = /* @__PURE__ */ new Map();
  intents = /* @__PURE__ */ new Map();
  restartIntents = /* @__PURE__ */ new Map();
  now;
  intentTtlMs;
  candidateTtlMs;
  maxIntents;
  maxCandidates;
  disabledPackageNames;
  generation = new AbortController();
  recoveryReconciliation;
  operationActive = false;
  closed = false;
  observeCatalog(snapshot) {
    if (this.closed) return;
    this.purge();
    for (const item of snapshot.items) {
      const key = candidateKey2(snapshot.source.sourceRecordId, item.id);
      this.candidates.delete(key);
      if (item.provenance.sourceRecordId !== snapshot.source.sourceRecordId || item.provenance.providerId !== snapshot.source.providerId || item.provenance.itemId !== item.id || item.package?.registry !== "npm" || !safePackageName(item.package.name) || !marketManagedPackage(item.package.name) || !stableExactVersion(item.latestVersion) || item.repository === void 0) {
        continue;
      }
      let repository;
      try {
        repository = normalizeRepositoryIdentity(item.repository);
      } catch {
        continue;
      }
      const candidate = {
        key,
        sourceRecordId: snapshot.source.sourceRecordId,
        providerId: snapshot.source.providerId,
        itemId: item.id,
        displayName: item.displayName,
        packageName: item.package.name,
        version: item.latestVersion,
        repository,
        savedAt: this.now()
      };
      this.candidates.set(key, candidate);
      this.trim(this.candidates, this.maxCandidates);
    }
  }
  invalidateSource(sourceRecordId) {
    for (const [key, candidate] of this.candidates) {
      if (candidate.sourceRecordId === sourceRecordId) {
        this.candidates.delete(key);
      }
    }
    for (const [token, intent] of this.intents) {
      if (intent.kind === "install" && intent.candidate.sourceRecordId === sourceRecordId) this.intents.delete(token);
    }
  }
  async listReceipts() {
    this.assertOpen();
    await this.ensureRecoveredInstallReconciled();
    const profile = this.profile();
    return this.receipts().filter((receipt) => receipt.profileName === profile.name);
  }
  /** Receipts that still prove one exact installed bundle in the active profile. */
  async listVerifiedReceipts(signal = this.generation.signal) {
    const operationSignal = this.operationSignal(signal);
    await this.ensureRecoveredInstallReconciled();
    operationSignal.throwIfAborted();
    const profile = this.profile();
    const receipts = this.receipts().filter((receipt) => receipt.profileName === profile.name);
    if (receipts.length === 0) return [];
    let snapshot;
    try {
      snapshot = await loadInstalledProfileSnapshot(profile);
    } catch {
      operationSignal.throwIfAborted();
      throw new MarketInstallError("operation-failed", "The active desktop profile could not be verified.");
    }
    const verified = [];
    for (const receipt of receipts) {
      try {
        await assertInstalledBundleFromSnapshot(
          snapshot,
          receipt.packageName,
          receipt.version,
          receipt.bundlePatch,
          receipt.integrity
        );
        operationSignal.throwIfAborted();
        verified.push(receipt);
      } catch {
        operationSignal.throwIfAborted();
      }
    }
    return verified;
  }
  async listInstallable(index, signal) {
    const operationSignal = this.operationSignal(signal);
    operationSignal.throwIfAborted();
    this.purge();
    const currentKeys = new Set(index.snapshots.flatMap((snapshot) => snapshot.items.map((item) => candidateKey2(index.source.sourceRecordId, item.id))));
    for (const [key, candidate] of this.candidates) {
      if (candidate.sourceRecordId === index.source.sourceRecordId && !currentKeys.has(key)) {
        this.candidates.delete(key);
      }
    }
    for (const snapshot of index.snapshots) this.observeCatalog(snapshot);
    operationSignal.throwIfAborted();
    const items = index.snapshots.flatMap((snapshot) => snapshot.items).filter((item) => {
      const candidate = this.candidates.get(candidateKey2(index.source.sourceRecordId, item.id));
      return candidate !== void 0 && candidate.providerId === item.provenance.providerId;
    });
    return {
      source: index.source,
      items,
      manualInstall: manualInstallHints(items),
      metadata: {
        scannedAt: index.scannedAt,
        expiresAt: index.expiresAt,
        ...index.providerRevision === void 0 ? {} : { providerRevision: index.providerRevision },
        cacheStatus: index.cacheStatus
      }
    };
  }
  async previewInstall(sourceRecordId, itemId, signal) {
    const operationSignal = this.operationSignal(signal);
    await this.ensureRecoveredInstallReconciled();
    operationSignal.throwIfAborted();
    this.purge();
    const key = candidateKey2(sourceRecordId, itemId);
    const candidate = this.candidates.get(key);
    if (candidate === void 0) {
      throw new MarketInstallError("not-available", "This catalog item has no verified install target. Refresh the active source and try again.");
    }
    if (this.disabledPackages().has(candidate.packageName)) {
      throw new MarketInstallError("conflict", "This plugin is disabled in the active desktop profile.");
    }
    const profile = this.profile();
    this.assertNoReceipt(profile, candidate.packageName);
    await assertNotInstalled(profile, candidate.packageName);
    let verification;
    try {
      verification = await this.verifier.verify(candidate, operationSignal);
    } catch (cause) {
      operationSignal.throwIfAborted();
      throw cause;
    }
    operationSignal.throwIfAborted();
    this.assertOpen();
    if (this.candidates.get(key) !== candidate) {
      throw new MarketInstallError("not-available", "The catalog source changed during verification. Refresh it and try again.");
    }
    const token = this.issueIntent({
      kind: "install",
      candidate,
      verification,
      profile,
      expiresAt: this.now() + this.intentTtlMs
    });
    return {
      intent: token,
      action: "install",
      profileName: profile.name,
      packageName: candidate.packageName,
      version: candidate.version,
      displayName: candidate.displayName,
      expiresAt: new Date(this.now() + this.intentTtlMs).toISOString()
    };
  }
  async executeInstall(token, signal) {
    return await this.runExclusive(async () => {
      const operationSignal = this.operationSignal(signal);
      const intent = this.consumeIntent(token, "install");
      const profile = this.sameProfile(intent.profile);
      const candidate = intent.candidate;
      const disabledPackages = this.disabledPackages();
      if (disabledPackages.has(candidate.packageName)) {
        throw new MarketInstallError("conflict", "This plugin is disabled in the active desktop profile.");
      }
      if (this.candidates.get(candidate.key) !== candidate) {
        throw new MarketInstallError("not-available", "The verified catalog item is no longer available.");
      }
      this.assertNoReceipt(profile, candidate.packageName);
      await assertNotInstalled(profile, candidate.packageName);
      let verification;
      try {
        verification = await this.verifier.verify(candidate, operationSignal);
      } catch (cause) {
        operationSignal.throwIfAborted();
        throw cause;
      }
      operationSignal.throwIfAborted();
      if (verification.integrity !== intent.verification.integrity || verification.bundlePatch !== intent.verification.bundlePatch || verification.tarball !== intent.verification.tarball) {
        throw new MarketInstallError("verification-failed", "The npm package changed after preview. Preview the install again.");
      }
      await assertNotInstalled(profile, candidate.packageName);
      if (this.candidates.get(candidate.key) !== candidate) {
        throw new MarketInstallError("not-available", "The catalog source changed before installation.");
      }
      if (disabledPackages.has(candidate.packageName)) {
        throw new MarketInstallError("conflict", "This plugin is disabled in the active desktop profile.");
      }
      const receipt = {
        receiptId: randomUUID2(),
        profileName: profile.name,
        packageName: candidate.packageName,
        version: candidate.version,
        integrity: verification.integrity,
        bundlePatch: verification.bundlePatch,
        sourceRecordId: candidate.sourceRecordId,
        providerId: candidate.providerId,
        itemId: candidate.itemId,
        displayName: candidate.displayName,
        installedAt: new Date(this.now()).toISOString()
      };
      try {
        await this.runPlugin(
          this.installOptions(candidate.packageName),
          profile,
          operationSignal,
          true,
          {
            packageName: receipt.packageName,
            packageVersion: receipt.version,
            receiptId: receipt.receiptId
          }
        );
      } catch (cause) {
        if (!await this.installMayHaveMutatedProfile(profile, candidate.packageName)) throw cause;
        await this.rollbackInstall(profile, candidate.packageName, receipt.receiptId);
        throw new MarketInstallError(
          "operation-failed",
          "The package manager failed after changing the active profile, so the partial installation was rolled back."
        );
      }
      try {
        await assertInstalledBundle(
          profile,
          candidate.packageName,
          candidate.version,
          verification.bundlePatch,
          verification.integrity
        );
        operationSignal.throwIfAborted();
      } catch {
        await this.rollbackInstall(profile, candidate.packageName, receipt.receiptId);
        throw new MarketInstallError(
          "operation-failed",
          "The package manager finished, but the plugin bundle was invalid, so the installation was rolled back."
        );
      }
      try {
        await this.saveReceipts([...this.receipts(), receipt]);
      } catch {
        await this.rollbackInstall(profile, candidate.packageName, receipt.receiptId);
        throw new MarketInstallError("persistence-failed", "The install receipt could not be saved, so the installation was rolled back.");
      }
      return { receipt };
    });
  }
  async executePreview(token, signal) {
    this.assertOpen();
    this.purge();
    const intent = this.intents.get(token);
    if (intent === void 0) {
      throw new MarketInstallError("intent-expired", "The confirmation expired or was already used. Preview the operation again.");
    }
    const result = intent.kind === "install" ? { action: "install", ...await this.executeInstall(token, signal), restartToken: this.issueRestartToken() } : intent.kind === "update" ? { action: "update", ...await this.executeUpdate(token, signal), restartToken: this.issueRestartToken() } : { action: "uninstall", ...await this.executeUninstall(token, signal), restartToken: this.issueRestartToken() };
    return result;
  }
  /** Consume one short-lived restart grant issued only after a completed mutation. */
  consumeRestartToken(token) {
    this.assertOpen();
    this.purge();
    const intent = this.restartIntents.get(token);
    if (intent === void 0) {
      throw new MarketInstallError("intent-expired", "The restart confirmation expired or was already used.");
    }
    this.restartIntents.delete(token);
    this.sameProfile(intent.profile);
  }
  async previewUninstall(receiptId, signal) {
    const operationSignal = this.operationSignal(signal);
    await this.ensureRecoveredInstallReconciled();
    operationSignal.throwIfAborted();
    const profile = this.profile();
    const receipt = this.receipts().find((value) => value.receiptId === receiptId && value.profileName === profile.name);
    if (receipt === void 0) {
      throw new MarketInstallError("not-available", "This plugin is not owned by a market install receipt in the active profile.");
    }
    try {
      await assertInstalledBundle(profile, receipt.packageName, receipt.version, receipt.bundlePatch, receipt.integrity);
      operationSignal.throwIfAborted();
    } catch {
      throw new MarketInstallError("conflict", "The installed plugin no longer matches its market receipt.");
    }
    const expiresAt = this.now() + this.intentTtlMs;
    const token = this.issueIntent({ kind: "uninstall", receipt, profile, expiresAt });
    return {
      intent: token,
      action: "uninstall",
      profileName: profile.name,
      packageName: receipt.packageName,
      version: receipt.version,
      displayName: receipt.displayName,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }
  async executeUninstall(token, signal) {
    return await this.runExclusive(async () => {
      const operationSignal = this.operationSignal(signal);
      const intent = this.consumeIntent(token, "uninstall");
      const profile = this.sameProfile(intent.profile);
      const currentReceipt = this.receipts().find((receipt) => receipt.receiptId === intent.receipt.receiptId);
      if (currentReceipt === void 0 || JSON.stringify(currentReceipt) !== JSON.stringify(intent.receipt)) {
        throw new MarketInstallError("conflict", "The market install receipt changed before uninstall.");
      }
      try {
        await assertInstalledBundle(
          profile,
          currentReceipt.packageName,
          currentReceipt.version,
          currentReceipt.bundlePatch,
          currentReceipt.integrity
        );
        operationSignal.throwIfAborted();
      } catch {
        throw new MarketInstallError("conflict", "The installed plugin no longer matches its market receipt.");
      }
      await this.runPlugin(["remove", currentReceipt.packageName], profile, operationSignal);
      try {
        await assertRemoved(profile, currentReceipt.packageName);
      } catch {
        throw new MarketInstallError("operation-failed", "The package manager finished, but the plugin remains in the active profile.");
      }
      try {
        await this.saveReceipts(this.receipts().filter((receipt) => receipt.receiptId !== currentReceipt.receiptId));
      } catch {
        throw new MarketInstallError("persistence-failed", "The plugin was removed, but its market receipt could not be updated.");
      }
      return { receiptId: currentReceipt.receiptId, packageName: currentReceipt.packageName };
    });
  }
  /**
   * 更新可用性检查（checkUpdates）：对每个市场回执，用当前已扫描目录候选中
   * 的 latestVersion 与回执安装版本做严格升格比较。不回退、不改文件，命中
   * 新版本才返回 updateAvailable: true。
   */
  async checkUpdates(signal = this.generation.signal) {
    const operationSignal = this.operationSignal(signal);
    await this.ensureRecoveredInstallReconciled();
    operationSignal.throwIfAborted();
    const profile = this.profile();
    const receipts = this.receipts().filter((receipt) => receipt.profileName === profile.name);
    const updates = [];
    for (const receipt of receipts) {
      const candidate = this.candidates.get(candidateKey2(receipt.sourceRecordId, receipt.itemId));
      if (candidate === void 0 || candidate.packageName !== receipt.packageName) continue;
      if (gt(candidate.version, receipt.version)) {
        updates.push({
          receiptId: receipt.receiptId,
          packageName: receipt.packageName,
          displayName: receipt.displayName,
          version: receipt.version,
          latestVersion: candidate.version,
          updateAvailable: true
        });
      }
    }
    return updates;
  }
  async previewUpdate(receiptId, signal) {
    const operationSignal = this.operationSignal(signal);
    await this.ensureRecoveredInstallReconciled();
    operationSignal.throwIfAborted();
    this.purge();
    const profile = this.profile();
    const receipt = this.receipts().find((value) => value.receiptId === receiptId && value.profileName === profile.name);
    if (receipt === void 0) {
      throw new MarketInstallError("not-available", "This plugin is not owned by a market install receipt in the active profile.");
    }
    try {
      await this.assertInstalled(profile, receipt.packageName, receipt.version, receipt.bundlePatch, receipt.integrity);
      operationSignal.throwIfAborted();
    } catch {
      throw new MarketInstallError("conflict", "The installed plugin no longer matches its market receipt.");
    }
    const key = candidateKey2(receipt.sourceRecordId, receipt.itemId);
    const candidate = this.candidates.get(key);
    if (candidate === void 0 || candidate.packageName !== receipt.packageName) {
      throw new MarketInstallError("not-available", "No verified update target is available. Refresh the active source and try again.");
    }
    if (!gt(candidate.version, receipt.version)) {
      throw new MarketInstallError("not-available", "This plugin is already up to date.");
    }
    let verification;
    try {
      verification = await this.verifier.verify(candidate, operationSignal);
    } catch (cause) {
      operationSignal.throwIfAborted();
      throw cause;
    }
    operationSignal.throwIfAborted();
    this.assertOpen();
    if (this.candidates.get(key) !== candidate) {
      throw new MarketInstallError("not-available", "The catalog source changed during verification. Refresh it and try again.");
    }
    const token = this.issueIntent({
      kind: "update",
      receipt,
      candidate,
      verification,
      profile,
      expiresAt: this.now() + this.intentTtlMs
    });
    return {
      intent: token,
      action: "update",
      profileName: profile.name,
      packageName: candidate.packageName,
      version: candidate.version,
      fromVersion: receipt.version,
      displayName: receipt.displayName,
      expiresAt: new Date(this.now() + this.intentTtlMs).toISOString()
    };
  }
  async runUpdatePlugin(candidate, previousVersion, receiptId, profile, signal) {
    const combinedSignal = AbortSignal.any([signal, this.generation.signal]);
    combinedSignal.throwIfAborted();
    let handle;
    try {
      handle = await this.pnpm.updatePlugin({
        packageName: candidate.packageName,
        packageVersion: candidate.version,
        previousVersion,
        invokingDir: profile.dir,
        receiptId,
        pnpmOptions: this.installOptions(candidate.packageName),
        signal: combinedSignal
      });
    } catch (cause) {
      throw packageManagerError("operation-failed", "The desktop package manager could not start the update.", cause);
    }
    handle.stdout.resume();
    handle.stderr.resume();
    const cancel = () => handle.cancel();
    combinedSignal.addEventListener("abort", cancel, { once: true });
    let outcome;
    try {
      outcome = await handle.done;
    } catch (cause) {
      combinedSignal.throwIfAborted();
      throw packageManagerError("operation-failed", "The desktop package manager failed during the update.", cause);
    } finally {
      combinedSignal.removeEventListener("abort", cancel);
    }
    combinedSignal.throwIfAborted();
    if (outcome.exitCode !== 0 || outcome.signal !== null) {
      throw new MarketInstallError("operation-failed", packageManagerFailure("The desktop package manager did not complete the update.", outcome));
    }
  }
  async executeUpdate(token, signal) {
    return await this.runExclusive(async () => {
      const operationSignal = this.operationSignal(signal);
      const intent = this.consumeIntent(token, "update");
      const profile = this.sameProfile(intent.profile);
      const candidate = intent.candidate;
      const previousReceipt = intent.receipt;
      const currentReceipt = this.receipts().find((receipt) => receipt.receiptId === previousReceipt.receiptId);
      if (currentReceipt === void 0 || JSON.stringify(currentReceipt) !== JSON.stringify(previousReceipt)) {
        throw new MarketInstallError("conflict", "The market install receipt changed before update.");
      }
      try {
        await this.assertInstalled(profile, previousReceipt.packageName, previousReceipt.version, previousReceipt.bundlePatch, previousReceipt.integrity);
        operationSignal.throwIfAborted();
      } catch {
        throw new MarketInstallError("conflict", "The installed plugin no longer matches its market receipt.");
      }
      if (this.candidates.get(candidate.key) !== candidate) {
        throw new MarketInstallError("not-available", "The verified catalog item is no longer available.");
      }
      let verification;
      try {
        verification = await this.verifier.verify(candidate, operationSignal);
      } catch (cause) {
        operationSignal.throwIfAborted();
        throw cause;
      }
      operationSignal.throwIfAborted();
      if (verification.integrity !== intent.verification.integrity || verification.bundlePatch !== intent.verification.bundlePatch || verification.tarball !== intent.verification.tarball) {
        throw new MarketInstallError("verification-failed", "The npm package changed after preview. Preview the update again.");
      }
      const receipt = {
        ...previousReceipt,
        version: candidate.version,
        integrity: verification.integrity,
        bundlePatch: verification.bundlePatch,
        installedAt: new Date(this.now()).toISOString()
      };
      try {
        await this.runUpdatePlugin(candidate, previousReceipt.version, previousReceipt.receiptId, profile, operationSignal);
      } catch (cause) {
        if (cause instanceof MarketInstallError && cause.code === "operation-failed") {
          await this.pnpm.rollbackPluginUpdate(previousReceipt.receiptId);
          throw new MarketInstallError("operation-failed", "The package manager failed during the update, so the previous version was restored.");
        }
        throw cause;
      }
      try {
        await this.assertInstalled(profile, candidate.packageName, candidate.version, verification.bundlePatch, verification.integrity);
        operationSignal.throwIfAborted();
      } catch {
        await this.pnpm.rollbackPluginUpdate(previousReceipt.receiptId);
        throw new MarketInstallError("operation-failed", "The package manager finished, but the updated bundle was invalid, so the update was rolled back.");
      }
      try {
        await this.saveReceipts(this.receipts().map((value) => value.receiptId === previousReceipt.receiptId ? receipt : value));
      } catch {
        await this.pnpm.rollbackPluginUpdate(previousReceipt.receiptId);
        throw new MarketInstallError("persistence-failed", "The updated receipt could not be saved, so the update was rolled back.");
      }
      return { receipt };
    });
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation.abort(new DOMException("Market install service was disposed", "AbortError"));
    this.candidates.clear();
    this.intents.clear();
    this.restartIntents.clear();
  }
  profile() {
    const profile = this.currentProfile();
    if (!profile.name || !isAbsolute(profile.dir) || profile.dir.includes("\0")) {
      throw new MarketInstallError("operation-failed", "The active desktop profile is unavailable.");
    }
    return Object.freeze({ name: profile.name, dir: resolve2(profile.dir) });
  }
  sameProfile(expected) {
    const current = this.profile();
    if (current.name !== expected.name || current.dir !== expected.dir) {
      throw new MarketInstallError("conflict", "The active desktop profile changed after preview.");
    }
    return current;
  }
  receipts() {
    const value = this.scope.get().installReceipts ?? [];
    if (!Array.isArray(value) || value.length > MAX_RECEIPTS || !value.every(validReceipt)) {
      throw new MarketInstallError("persistence-failed", "The market install receipt store is invalid.");
    }
    const ids = new Set(value.map((receipt) => receipt.receiptId));
    const ownedPackages = new Set(value.map((receipt) => `${receipt.profileName}\0${receipt.packageName}`));
    if (ids.size !== value.length || ownedPackages.size !== value.length) {
      throw new MarketInstallError("persistence-failed", "The market install receipt store is invalid.");
    }
    return value;
  }
  assertNoReceipt(profile, packageName) {
    if (this.receipts().some((receipt) => receipt.profileName === profile.name && receipt.packageName === packageName)) {
      throw new MarketInstallError("conflict", "This plugin already has a market install receipt in the active profile.");
    }
  }
  disabledPackages() {
    let names;
    try {
      names = this.disabledPackageNames();
    } catch (cause) {
      if (cause instanceof MarketInstallError) throw cause;
      throw new MarketInstallError("operation-failed", "Desktop plugin policy state is unavailable.");
    }
    if (!Array.isArray(names) || names.length > 1e4 || !names.every(safePackageName)) {
      throw new MarketInstallError("operation-failed", "Desktop plugin policy state is invalid.");
    }
    return new Set(names);
  }
  async saveReceipts(receipts) {
    if (receipts.length > MAX_RECEIPTS || !receipts.every(validReceipt)) throw new Error("invalid receipts");
    await this.scope.update({ installReceipts: receipts });
  }
  async ensureRecoveredInstallReconciled() {
    const existing = this.recoveryReconciliation;
    if (existing !== void 0) return await existing;
    const operation = this.reconcileRecoveredInstall();
    this.recoveryReconciliation = operation;
    try {
      await operation;
    } catch (cause) {
      if (this.recoveryReconciliation === operation) this.recoveryReconciliation = void 0;
      throw cause;
    }
  }
  async reconcileRecoveredInstall() {
    const receiptIds = await this.pnpm.recoveredInstallReceiptIds();
    if (receiptIds.length === 0) return;
    const uniqueIds = new Set(receiptIds);
    const current = this.receipts();
    const retained = current.filter((receipt) => !uniqueIds.has(receipt.receiptId));
    if (retained.length !== current.length) await this.saveReceipts(retained);
    for (const receiptId of uniqueIds) await this.pnpm.acknowledgeRecoveredInstall(receiptId);
  }
  issueIntent(intent) {
    this.assertOpen();
    this.purge();
    let token = opaqueToken();
    while (this.intents.has(token)) token = opaqueToken();
    this.intents.set(token, intent);
    this.trim(this.intents, this.maxIntents);
    return token;
  }
  issueRestartToken() {
    this.assertOpen();
    this.purge();
    let token = opaqueToken();
    while (this.restartIntents.has(token)) token = opaqueToken();
    this.restartIntents.set(token, {
      profile: this.profile(),
      expiresAt: this.now() + this.intentTtlMs
    });
    this.trim(this.restartIntents, this.maxIntents);
    return token;
  }
  consumeIntent(token, kind) {
    this.purge();
    const intent = this.intents.get(token);
    if (intent === void 0 || intent.kind !== kind) {
      throw new MarketInstallError("intent-expired", "The confirmation expired or was already used. Preview the operation again.");
    }
    this.intents.delete(token);
    return intent;
  }
  purge() {
    const now = this.now();
    for (const [key, candidate] of this.candidates) {
      if (now - candidate.savedAt >= this.candidateTtlMs) {
        this.candidates.delete(key);
      }
    }
    for (const [token, intent] of this.intents) {
      if (now >= intent.expiresAt) this.intents.delete(token);
    }
    for (const [token, intent] of this.restartIntents) {
      if (now >= intent.expiresAt) this.restartIntents.delete(token);
    }
  }
  trim(map, limit) {
    while (map.size > limit) {
      const oldest = map.keys().next().value;
      if (oldest === void 0) return;
      map.delete(oldest);
    }
  }
  async runExclusive(task) {
    this.assertOpen();
    if (this.operationActive) throw new MarketInstallError("conflict", "Another market package operation is already running.");
    this.operationActive = true;
    try {
      return await task();
    } finally {
      this.operationActive = false;
    }
  }
  assertOpen() {
    if (this.closed) throw new MarketInstallError("operation-failed", "The market install service is unavailable.");
  }
  operationSignal(signal) {
    signal.throwIfAborted();
    this.assertOpen();
    return AbortSignal.any([signal, this.generation.signal]);
  }
  async installMayHaveMutatedProfile(profile, packageName) {
    try {
      return await profileHasPluginReference(profile, packageName);
    } catch {
      return true;
    }
  }
  async runPlugin(args, profile, signal, includeGeneration = true, installRecovery) {
    const combinedSignal = includeGeneration ? AbortSignal.any([signal, this.generation.signal]) : signal;
    combinedSignal.throwIfAborted();
    let handle;
    try {
      handle = installRecovery === void 0 ? this.pnpm.runPlugin(args, profile.dir, combinedSignal) : await this.pnpm.installPlugin({
        pnpmOptions: args,
        invokingDir: profile.dir,
        recovery: installRecovery,
        signal: combinedSignal
      });
    } catch (cause) {
      throw packageManagerError("operation-failed", "The desktop package manager could not start.", cause);
    }
    handle.stdout.resume();
    handle.stderr.resume();
    const cancel = () => handle.cancel();
    combinedSignal.addEventListener("abort", cancel, { once: true });
    let outcome;
    try {
      outcome = await handle.done;
    } catch (cause) {
      combinedSignal.throwIfAborted();
      throw packageManagerError("operation-failed", "The desktop package manager failed.", cause);
    } finally {
      combinedSignal.removeEventListener("abort", cancel);
    }
    combinedSignal.throwIfAborted();
    if (outcome.exitCode !== 0 || outcome.signal !== null) {
      throw new MarketInstallError("operation-failed", packageManagerFailure("The desktop package manager did not complete successfully.", outcome));
    }
  }
  installOptions(packageName) {
    const scope = packageName.startsWith("@") ? packageName.split("/", 1)[0] : void 0;
    return [
      "--save-exact",
      `--registry=${NPM_REGISTRY}`,
      ...scope === void 0 ? [] : [`--${scope}:registry=${NPM_REGISTRY}`]
    ];
  }
  async rollbackInstall(profile, packageName, receiptId) {
    try {
      await this.pnpm.rollbackPluginInstall(receiptId);
      await assertRemoved(profile, packageName);
    } catch {
      throw new MarketInstallError(
        "persistence-failed",
        "The failed installation could not be restored safely. Use the saved recovery state before another plugin change."
      );
    }
  }
};

// src/host/routes.ts
var MARKET_SETTINGS_NAMESPACE = "dsh-community-market";
var SOURCE_SCHEMA = z.object({
  sourceRecordId: z.string().required(),
  registrationKind: z.union(["user-added", "built-in"]).required(),
  adapterId: z.string().required(),
  providerId: z.string().required(),
  manifestUrl: z.string(),
  manifest: z.any(),
  builtInProviderKey: z.string(),
  enabled: z.boolean().required(),
  order: z.number().required()
});
var SETTINGS_SCHEMA = z.object({
  sources: z.array(SOURCE_SCHEMA).default([]),
  installReceipts: z.array(z.object({
    receiptId: z.string().required(),
    profileName: z.string().required(),
    packageName: z.string().required(),
    version: z.string().required(),
    integrity: z.string().required(),
    bundlePatch: z.string().required(),
    sourceRecordId: z.string().required(),
    providerId: z.string().required(),
    itemId: z.string().required(),
    displayName: z.string().required(),
    installedAt: z.string().required()
  })).default([]),
  catalogCache: z.object({
    version: z.number().step(1),
    sourceRecordId: z.string(),
    locale: z.string(),
    savedAt: z.string(),
    snapshot: z.any(),
    categories: z.array(z.string()),
    scannedAt: z.string(),
    expiresAt: z.string(),
    providerRevision: z.string()
  }).default(void 0)
});
var ROUTE_STATE = "/api/community-market/state";
var ROUTE_SOURCES = "/api/community-market/sources";
var ROUTE_CATALOG = "/api/community-market/catalog";
var ROUTE_INSTALLABLE = "/api/community-market/installable";
var ROUTE_ASSETS = "/api/community-market/assets";
var ROUTE_INSTALLATIONS = "/api/community-market/installations";
var ROUTE_OPEN_TERMINAL = "/api/community-market/desktop/open-terminal";
var ROUTE_REQUEST_RESTART = "/api/community-market/desktop/request-restart";
var ROUTE_OPERATION_PREVIEW = "/api/community-market/operations/preview";
var ROUTE_OPERATION_EXECUTE = "/api/community-market/operations/execute";
var MAX_BODY_BYTES3 = 16 * 1024;
var MAX_DSH_1024STORE_BODY_BYTES = 16 * 1024 * 1024;
var CATALOG_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1e3;
var dsh1024StoreHttpClient = createCachedCatalogHttpClient(
  createRestrictedHttpClient({
    syntheticProxyHostnames: [DSH_1024STORE_HOSTNAME],
    maxBodyBytes: MAX_DSH_1024STORE_BODY_BYTES
  })
);
var dshfindHttpClient = createCachedCatalogHttpClient(
  createRestrictedHttpClient({
    // This exact hostname is compiled into the reviewed adapter. User-added
    // source hostnames must never inherit this local-proxy exception.
    syntheticProxyHostnames: [DSHFIND_HOSTNAME]
  })
);
function sendJson(res, status, value) {
  const body = JSON.stringify(value);
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end(body);
}
function sendInstallError(res, cause) {
  if (!(cause instanceof MarketInstallError)) {
    sendJson(res, 500, { error: "market package operation failed", code: "operation-failed" });
    return;
  }
  const status = cause.code === "invalid-request" ? 400 : cause.code === "not-available" ? 404 : cause.code === "conflict" ? 409 : cause.code === "intent-expired" ? 410 : cause.code === "verification-failed" ? 422 : cause.code === "operation-failed" ? 502 : 500;
  sendJson(res, status, { error: cause.message, code: cause.code });
}
function sendCatalogFailure(res, cause) {
  let code = "catalog-unavailable";
  if (cause instanceof CatalogNetworkError && cause.code === "timeout") code = "catalog-timeout";
  else if (cause instanceof CatalogNetworkError && cause.code === "response" || cause instanceof CatalogContractError) code = "catalog-invalid-response";
  const status = code === "catalog-timeout" ? 504 : 502;
  const error = code === "catalog-timeout" ? "catalog request timed out" : code === "catalog-invalid-response" ? "catalog response was invalid" : "catalog source unavailable";
  sendJson(res, status, { error, code });
}
function catalogMetadata(index) {
  return {
    scannedAt: index.scannedAt,
    expiresAt: index.expiresAt,
    ...index.providerRevision === void 0 ? {} : { providerRevision: index.providerRevision },
    cacheStatus: index.cacheStatus
  };
}
function catalogCategories(index) {
  return [...new Set(index.snapshots.flatMap((snapshot) => snapshot.items.flatMap((item) => item.categories ?? [])))].sort((left, right) => left.localeCompare(right, "en", { sensitivity: "base" }));
}
function catalogManualInstall(results) {
  return manualInstallHints(results.flatMap((result) => result.snapshot?.items ?? []));
}
function cachedCatalogResponse(cache, source, locale, now = Date.now()) {
  if (cache === void 0 || cache.version !== 1 || cache.sourceRecordId !== source.sourceRecordId || cache.locale !== locale || !Number.isFinite(Date.parse(cache.savedAt)) || now - Date.parse(cache.savedAt) < 0 || now - Date.parse(cache.savedAt) > CATALOG_CACHE_MAX_AGE_MS || !Array.isArray(cache.categories) || cache.categories.length > 4096 || !cache.categories.every((value) => typeof value === "string") || !Number.isFinite(Date.parse(cache.scannedAt)) || !Number.isFinite(Date.parse(cache.expiresAt))) return void 0;
  let snapshot;
  try {
    snapshot = parseCatalogSnapshot(cache.snapshot);
  } catch {
    return void 0;
  }
  if (snapshot.source.sourceRecordId !== source.sourceRecordId || snapshot.source.providerId !== source.providerId || snapshot.source.adapterId !== source.adapterId || snapshot.source.registrationKind !== source.registrationKind) return void 0;
  return {
    query: { limit: 50, locale },
    results: [{ source, stale: true, snapshot }],
    categories: [...cache.categories],
    manualInstall: catalogManualInstall([{ snapshot }]),
    metadata: {
      scannedAt: cache.scannedAt,
      expiresAt: cache.expiresAt,
      ...cache.providerRevision === void 0 ? {} : { providerRevision: cache.providerRevision },
      cacheStatus: "cached"
    },
    fetchedAt: new Date(now).toISOString()
  };
}
function catalogCacheFromResponse(response, sourceRecordId, locale, now = Date.now()) {
  const result = response.results.find((value) => value.source.sourceRecordId === sourceRecordId);
  const snapshot = result?.snapshot;
  const metadata = response.metadata;
  if (snapshot === void 0 || metadata === void 0 || !Number.isFinite(Date.parse(metadata.scannedAt)) || !Number.isFinite(Date.parse(metadata.expiresAt)) || !Array.isArray(response.categories) || response.categories.length > 4096 || !response.categories.every((value) => typeof value === "string")) return void 0;
  const { nextCursor: _nextCursor, ...page } = snapshot.page;
  let normalizedSnapshot;
  try {
    normalizedSnapshot = parseCatalogSnapshot({ ...snapshot, page });
  } catch {
    return void 0;
  }
  return {
    version: 1,
    sourceRecordId,
    locale,
    savedAt: new Date(now).toISOString(),
    snapshot: normalizedSnapshot,
    categories: [...response.categories],
    scannedAt: metadata.scannedAt,
    expiresAt: metadata.expiresAt,
    ...metadata.providerRevision === void 0 ? {} : { providerRevision: metadata.providerRevision }
  };
}
function abortOnDisconnect(req, res, controller) {
  const abort = () => controller.abort();
  const abortIfUnfinished = () => {
    if (!res.writableEnded) controller.abort();
  };
  req.once("aborted", abort);
  res.once("close", abortIfUnfinished);
  return () => {
    req.off("aborted", abort);
    res.off("close", abortIfUnfinished);
  };
}
function readJson(req, signal) {
  const abortReason = () => signal.reason ?? new DOMException("The operation was aborted", "AbortError");
  if (signal.aborted) return Promise.reject(abortReason());
  return new Promise((resolve3, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onRequestAbort);
      signal.removeEventListener("abort", onSignalAbort);
    };
    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_BODY_BYTES3) {
        const cause = new Error("body too large");
        finish(() => {
          req.destroy(cause);
          reject(cause);
        });
        return;
      }
      chunks.push(buffer);
    };
    const onEnd = () => {
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        finish(() => resolve3(value));
      } catch {
        finish(() => reject(new Error("invalid json")));
      }
    };
    const onError = (cause) => finish(() => reject(cause));
    const onRequestAbort = () => finish(() => reject(new DOMException("The request was aborted", "AbortError")));
    const onSignalAbort = () => finish(() => reject(abortReason()));
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.once("aborted", onRequestAbort);
    signal.addEventListener("abort", onSignalAbort, { once: true });
  });
}
var loopbackAddresses = new BlockList3();
loopbackAddresses.addSubnet("127.0.0.0", 8, "ipv4");
loopbackAddresses.addSubnet("::1", 128, "ipv6");
function marketAuthority(context) {
  if (context.remoteAddress === void 0 || context.host === void 0) return void 0;
  const address = context.remoteAddress.replace(/^\[|\]$/gu, "").split("%", 1)[0];
  const family = isIP3(address);
  if (family === 0 || !loopbackAddresses.check(address, family === 4 ? "ipv4" : "ipv6")) return void 0;
  let authority;
  try {
    authority = new URL(`http://${context.host}`);
  } catch {
    return void 0;
  }
  if (authority.protocol !== "http:" || Number(authority.port || "80") !== context.expectedPort || authority.hostname !== "127.0.0.1" || context.secFetchSite === "cross-site") return void 0;
  return authority;
}
function marketRequestAllowed(context) {
  return marketAuthority(context) !== void 0;
}
function marketMutationAllowed(context) {
  const authority = marketAuthority(context);
  if (authority === void 0 || context.origin === void 0) return false;
  try {
    const origin = new URL(context.origin);
    return origin.protocol === "http:" && origin.host === authority.host && origin.pathname === "/";
  } catch {
    return false;
  }
}
function requestContext(req, expectedPort) {
  const secFetchSite = req.headers["sec-fetch-site"];
  return {
    remoteAddress: req.socket.remoteAddress,
    origin: req.headers.origin,
    host: req.headers.host,
    ...typeof secFetchSite === "string" ? { secFetchSite } : {},
    expectedPort
  };
}
function requestAllowed(req, expectedPort) {
  return marketRequestAllowed(requestContext(req, expectedPort));
}
function mutationAllowed(req, expectedPort) {
  return marketMutationAllowed({
    ...requestContext(req, expectedPort)
  });
}
function asMutation(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("invalid mutation");
  const mutation = value;
  if (mutation.action === "add-builtin" && typeof mutation.key === "string" && mutation.key.length > 0 && mutation.key.length <= 64) return { action: "add-builtin", key: mutation.key };
  if (mutation.action === "add-standard" && typeof mutation.manifestUrl === "string") return { action: "add-standard", manifestUrl: mutation.manifestUrl };
  if (mutation.action === "select" && typeof mutation.sourceRecordId === "string") {
    return { action: "select", sourceRecordId: mutation.sourceRecordId };
  }
  if (mutation.action === "move" && typeof mutation.sourceRecordId === "string" && (mutation.direction === "up" || mutation.direction === "down")) {
    return { action: "move", sourceRecordId: mutation.sourceRecordId, direction: mutation.direction };
  }
  if (mutation.action === "remove" && typeof mutation.sourceRecordId === "string") return { action: "remove", sourceRecordId: mutation.sourceRecordId };
  throw new Error("unsupported mutation");
}
function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  return actual.length === keys.length && actual.every((key, index) => key === [...keys].sort()[index]);
}
function boundedIdentifier(value) {
  return typeof value === "string" && value.length >= 1 && value.length <= 240 && !value.includes("\0");
}
function asOperationPreview(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MarketInstallError("invalid-request", "Invalid package operation preview request.");
  }
  const request = value;
  if (request.action === "install" && exactKeys(request, ["action", "sourceRecordId", "itemId"]) && boundedIdentifier(request.sourceRecordId) && boundedIdentifier(request.itemId)) return { action: "install", sourceRecordId: request.sourceRecordId, itemId: request.itemId };
  if (request.action === "uninstall" && exactKeys(request, ["action", "receiptId"]) && boundedIdentifier(request.receiptId)) return { action: "uninstall", receiptId: request.receiptId };
  if (request.action === "update" && exactKeys(request, ["action", "receiptId"]) && boundedIdentifier(request.receiptId)) return { action: "update", receiptId: request.receiptId };
  if ((request.action === "disable" || request.action === "enable") && exactKeys(request, ["action", "bundleId"]) && boundedIdentifier(request.bundleId)) return { action: request.action, bundleId: request.bundleId };
  throw new MarketInstallError("invalid-request", "Invalid package operation preview request.");
}
function asOperationExecute(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MarketInstallError("invalid-request", "Invalid package operation execution request.");
  }
  const request = value;
  if (!exactKeys(request, ["previewId"]) || !boundedIdentifier(request.previewId)) {
    throw new MarketInstallError("invalid-request", "Invalid package operation execution request.");
  }
  return request.previewId;
}
function asEmptyDesktopAction(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 0) {
    throw new MarketInstallError("invalid-request", "The desktop action request must not contain parameters.");
  }
}
function asRestartToken(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new MarketInstallError("invalid-request", "The restart request was invalid.");
  }
  const request = value;
  if (!exactKeys(request, ["restartToken"]) || !boundedIdentifier(request.restartToken)) {
    throw new MarketInstallError("invalid-request", "The restart request was invalid.");
  }
  return request.restartToken;
}
async function readOperationJson(req, signal) {
  try {
    return await readJson(req, signal);
  } catch (cause) {
    if (signal.aborted) throw cause;
    throw new MarketInstallError("invalid-request", "The package operation request body was invalid.");
  }
}
function validDesktopBundle(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const bundle = value;
  return exactKeys(bundle, ["bundleId", "packageName", "status", "mutable"]) && boundedIdentifier(bundle.bundleId) && boundedIdentifier(bundle.packageName) && (bundle.status === "active" || bundle.status === "disabled") && typeof bundle.mutable === "boolean";
}
function reconcileInstallations(receipts, value) {
  if (!Array.isArray(value) || value.length > 4096 || !value.every(validDesktopBundle)) {
    throw new MarketInstallError("operation-failed", "The desktop plugin inventory was invalid.");
  }
  const ids = new Set(value.map((bundle) => bundle.bundleId));
  if (ids.size !== value.length) {
    throw new MarketInstallError("operation-failed", "The desktop plugin inventory was invalid.");
  }
  const packageCounts = /* @__PURE__ */ new Map();
  for (const bundle of value) packageCounts.set(bundle.packageName, (packageCounts.get(bundle.packageName) ?? 0) + 1);
  const receiptsByPackage = new Map(receipts.map((receipt) => [receipt.packageName, receipt]));
  return value.flatMap((bundle) => {
    const receipt = packageCounts.get(bundle.packageName) === 1 ? receiptsByPackage.get(bundle.packageName) : void 0;
    if (receipt !== void 0) {
      return bundle.mutable && bundle.status === "active" ? [{
        kind: "managed",
        status: "active",
        action: "uninstall",
        disableBundleId: bundle.bundleId,
        receipt
      }] : bundle.mutable && bundle.status === "disabled" ? [{
        kind: "managed",
        status: "disabled",
        action: "uninstall",
        enableBundleId: bundle.bundleId,
        receipt
      }] : [{ kind: "managed", status: bundle.status, action: "uninstall", receipt }];
    }
    if (!bundle.mutable) return [];
    return bundle.status === "active" ? [{
      kind: "external",
      status: "active",
      action: "disable",
      bundleId: bundle.bundleId,
      packageName: bundle.packageName
    }] : [{
      kind: "external",
      status: "disabled",
      action: "enable",
      bundleId: bundle.bundleId,
      packageName: bundle.packageName
    }];
  });
}
/** 把 checkUpdates 的更新命中按 receiptId 合并进已装列表（仅受管回执）。 */
function mergeInstallationUpdates(installations, updates) {
  const updatesByReceipt = /* @__PURE__ */ new Map();
  for (const update of updates) updatesByReceipt.set(update.receiptId, update);
  return installations.map((installation) => {
    const update = installation.kind === "managed" ? updatesByReceipt.get(installation.receipt.receiptId) : void 0;
    return update === void 0 ? installation : { ...installation, updateAvailable: true, latestVersion: update.latestVersion };
  });
}
function viewBuiltIns() {
  return BUILT_IN_PROVIDERS.map((provider) => ({ ...provider }));
}
async function readStandardSourceManifest(manifestUrl, signal, http = restrictedHttpClient) {
  const url = new URL(manifestUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("manifest URL must use credential-free standard HTTPS port 443");
  }
  const response = await http.getJson(url.href, signal, { allowedOrigin: url.origin });
  const manifest = parseCatalogSource(response.value);
  assertStandardSourceTrustRoot(url.href, response.finalUrl, manifest.transport.endpoint);
  return manifest;
}
async function mutateSources(scope, mutation, signal, onUnavailable, readManifest2 = readStandardSourceManifest) {
  signal.throwIfAborted();
  const store = new SettingsCatalogSourceStore(scope);
  const records = [...await store.load()];
  const unavailableSourceRecordIds = /* @__PURE__ */ new Set();
  const nextOrder = records.reduce((maximum, record3) => Math.max(maximum, record3.order), -1) + 1;
  if (mutation.action === "add-builtin") {
    const provider = BUILT_IN_PROVIDERS.find((candidate) => candidate.key === mutation.key);
    if (provider === void 0) throw new Error("built-in source unavailable");
    if (records.some((record3) => record3.builtInProviderKey === mutation.key)) throw new Error("source already added");
    records.push({
      sourceRecordId: randomUUID3(),
      registrationKind: "built-in",
      adapterId: provider.adapterId,
      providerId: provider.providerId,
      builtInProviderKey: provider.key,
      enabled: false,
      order: nextOrder
    });
  } else if (mutation.action === "add-standard") {
    const manifest = await readManifest2(mutation.manifestUrl, signal);
    signal.throwIfAborted();
    if (records.some((record3) => record3.manifestUrl === mutation.manifestUrl)) throw new Error("source already added");
    records.push({
      sourceRecordId: randomUUID3(),
      registrationKind: "user-added",
      adapterId: "market.standard-http-v1",
      providerId: manifest.providerId,
      manifestUrl: mutation.manifestUrl,
      manifest,
      enabled: false,
      order: nextOrder
    });
  } else if (mutation.action === "select" || mutation.action === "remove") {
    const index = records.findIndex((record3) => record3.sourceRecordId === mutation.sourceRecordId);
    if (index < 0) throw new Error("source not found");
    if (mutation.action === "remove") {
      unavailableSourceRecordIds.add(records[index].sourceRecordId);
      records.splice(index, 1);
      records.sort((left, right) => left.order - right.order);
      records.forEach((record3, order) => {
        records[order] = { ...record3, order };
      });
    } else {
      for (const [recordIndex, record3] of records.entries()) {
        const enabled = record3.sourceRecordId === mutation.sourceRecordId;
        if (record3.enabled && !enabled) unavailableSourceRecordIds.add(record3.sourceRecordId);
        records[recordIndex] = { ...record3, enabled };
      }
    }
  } else {
    const ordered = [...records].sort((left, right) => left.order - right.order);
    const index = ordered.findIndex((record3) => record3.sourceRecordId === mutation.sourceRecordId);
    if (index < 0) throw new Error("source not found");
    const targetIndex = mutation.direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) throw new Error("source cannot move further");
    const current = ordered[index];
    const target = ordered[targetIndex];
    const currentRecordIndex = records.findIndex((record3) => record3.sourceRecordId === current.sourceRecordId);
    const targetRecordIndex = records.findIndex((record3) => record3.sourceRecordId === target.sourceRecordId);
    records[currentRecordIndex] = { ...current, order: target.order };
    records[targetRecordIndex] = { ...target, order: current.order };
  }
  validateLocalSourceRecords(records);
  signal.throwIfAborted();
  await store.save(records);
  for (const sourceRecordId of unavailableSourceRecordIds) onUnavailable?.(sourceRecordId);
}
function createMarketSourceMutator(scope, onUnavailable, readManifest2) {
  let tail = Promise.resolve();
  return (mutation, signal) => {
    const pending = tail.then(async () => {
      signal.throwIfAborted();
      await mutateSources(scope, mutation, signal, onUnavailable, readManifest2);
    });
    tail = pending.catch(() => {
    });
    return pending;
  };
}
function registerMarketRoutes(ctx, scope, installProvider, desktopActionsProvider, desktopPluginsProvider) {
  const expectedPort = ctx.webServer.port;
  const generationController = new AbortController();
  const disablePreviews = /* @__PURE__ */ new Map();
  const enablePreviews = /* @__PURE__ */ new Map();
  const desktopPluginRestartTokens = /* @__PURE__ */ new Map();
  const purgeDesktopTokens = () => {
    const now = Date.now();
    for (const [token, preview] of disablePreviews) {
      if (now >= preview.expiresAt) disablePreviews.delete(token);
    }
    for (const [token, preview] of enablePreviews) {
      if (now >= preview.expiresAt) enablePreviews.delete(token);
    }
    for (const [token, expiresAt] of desktopPluginRestartTokens) {
      if (now >= expiresAt) desktopPluginRestartTokens.delete(token);
    }
  };
  const rememberDesktopToken = (tokens, token, expiresAt) => {
    purgeDesktopTokens();
    tokens.set(token, expiresAt);
    while (tokens.size > 256) {
      const oldest = tokens.keys().next().value;
      if (oldest === void 0) break;
      tokens.delete(oldest);
    }
  };
  const rememberDisablePreview = (previewId, expiresAt, bundleId, packageName, receiptId) => {
    purgeDesktopTokens();
    disablePreviews.set(previewId, {
      expiresAt,
      bundleId,
      packageName,
      ...receiptId === void 0 ? {} : { receiptId }
    });
    while (disablePreviews.size > 256) {
      const oldest = disablePreviews.keys().next().value;
      if (oldest === void 0) break;
      disablePreviews.delete(oldest);
    }
  };
  const rememberEnablePreview = (previewId, expiresAt, bundleId, packageName, receiptId) => {
    purgeDesktopTokens();
    enablePreviews.set(previewId, {
      expiresAt,
      bundleId,
      packageName,
      ...receiptId === void 0 ? {} : { receiptId }
    });
    while (enablePreviews.size > 256) {
      const oldest = enablePreviews.keys().next().value;
      if (oldest === void 0) break;
      enablePreviews.delete(oldest);
    }
  };
  const store = new SettingsCatalogSourceStore(scope);
  const media = createMarketMediaService({
    fetchImage: createRestrictedImageFetcher({
      // These are compiled-in adapter hosts, not names supplied by a remote source.
      syntheticProxyHostnames: [DSH_1024STORE_HOSTNAME, "github.com", "avatars.githubusercontent.com"]
    })
  });
  const service = new DefaultCatalogService(store, restrictedHttpClient, {
    adapterHttpClients: /* @__PURE__ */ new Map([
      [DSH_1024STORE_ADAPTER_ID, dsh1024StoreHttpClient],
      [DSHFIND_ADAPTER_ID, dshfindHttpClient]
    ]),
    media,
    observeSnapshot: (snapshot) => installProvider?.get()?.observeCatalog(snapshot)
  });
  const servedCatalogPreviews = /* @__PURE__ */ new Set();
  const catalogPreviewKey = (sourceRecordId, locale) => `${sourceRecordId}\0${locale}`;
  const mutateSource = createMarketSourceMutator(scope, (sourceRecordId) => {
    service.invalidateSource(sourceRecordId);
    for (const key of servedCatalogPreviews) {
      if (key.startsWith(`${sourceRecordId}\0`)) servedCatalogPreviews.delete(key);
    }
    installProvider?.get()?.invalidateSource(sourceRecordId);
  });
  const buildCatalogResponse = (index, query, fetchScope) => {
    const results = index === void 0 ? [] : service.queryCatalog(index, query, fetchScope);
    const responseQuery = fetchScope === void 0 ? query : {
      ...query,
      sourceRecordId: fetchScope.sourceRecordId,
      ...fetchScope.cursor === void 0 ? {} : { cursor: fetchScope.cursor }
    };
    return {
      query: responseQuery,
      results,
      categories: index === void 0 ? [] : catalogCategories(index),
      manualInstall: catalogManualInstall(results),
      ...index === void 0 ? {} : { metadata: catalogMetadata(index) },
      fetchedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
  };
  const persistCatalogResponse = async (response, sourceRecordId, locale) => {
    const cache = catalogCacheFromResponse(response, sourceRecordId, locale);
    if (cache !== void 0) await scope.update({ catalogCache: cache });
  };
  const settingsScope = scope;
  const routes = [
    ctx.webServer.register({ kind: "exact", path: ROUTE_STATE, handler: async (_req, res) => {
      if (generationController.signal.aborted) return;
      if (!requestAllowed(_req, expectedPort)) {
        sendJson(res, 403, { error: "market request authority rejected" });
        return;
      }
      try {
        const desktopActions = desktopActionsProvider?.get();
        const response = {
          sources: await service.listSources(),
          builtIns: viewBuiltIns(),
          desktopActions: {
            openTerminal: desktopActions !== void 0,
            requestRestart: desktopActions !== void 0 && (installProvider?.get() !== void 0 || desktopPluginsProvider?.get() !== void 0)
          }
        };
        if (!generationController.signal.aborted && !res.destroyed) sendJson(res, 200, response);
      } catch {
        if (!generationController.signal.aborted && !res.destroyed) sendJson(res, 500, { error: "market state unavailable" });
      }
    } }),
    ctx.webServer.register({ kind: "exact", path: ROUTE_CATALOG, handler: async (req, res) => {
      if (!requestAllowed(req, expectedPort)) {
        sendJson(res, 403, { error: "market request authority rejected" });
        return;
      }
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "market catalog requires GET" });
        return;
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, generationController.signal]);
      const stopWatching = abortOnDisconnect(req, res, controller);
      let refreshPreviewKey;
      try {
        const requestUrl = new URL(req.url ?? "/", "http://localhost");
        const query = {};
        const q = requestUrl.searchParams.get("q")?.trim();
        if (q) query.q = q;
        const categories = requestUrl.searchParams.getAll("category");
        if (categories.length) query.category = categories;
        const limit = Number(requestUrl.searchParams.get("limit") ?? 50);
        if (Number.isInteger(limit)) query.limit = limit;
        const sort = requestUrl.searchParams.get("sort");
        if (sort) query.sort = sort;
        const locale = requestUrl.searchParams.get("locale");
        if (locale) query.locale = locale;
        const refreshValues = requestUrl.searchParams.getAll("refresh");
        if (refreshValues.length > 1 || refreshValues.length === 1 && refreshValues[0] !== "1") {
          throw new Error("invalid catalog refresh flag");
        }
        const force = refreshValues.length === 1;
        const sourceRecordIds = requestUrl.searchParams.getAll("sourceRecordId");
        const cursors = requestUrl.searchParams.getAll("cursor");
        if (sourceRecordIds.length > 1 || cursors.length > 1 || cursors.length > sourceRecordIds.length) {
          throw new Error("catalog cursor requires exactly one source record");
        }
        const scope2 = sourceRecordIds.length === 0 ? void 0 : {
          sourceRecordId: sourceRecordIds[0],
          ...cursors.length === 0 ? {} : { cursor: cursors[0] }
        };
        const activeSource = scope2 === void 0 ? void 0 : (await service.listSources()).find((source) => source.enabled && source.sourceRecordId === scope2.sourceRecordId);
        if (scope2 !== void 0 && activeSource === void 0) throw new Error("catalog source is not active");
        const localeKey = locale ?? "";
        const previewSourceRecordId = q === void 0 && categories.length === 0 && sort === null && limit === 50 && scope2 !== void 0 && scope2.cursor === void 0 ? scope2.sourceRecordId : void 0;
        const previewKey = previewSourceRecordId === void 0 ? void 0 : catalogPreviewKey(previewSourceRecordId, localeKey);
        if (force) refreshPreviewKey = previewKey;
        if (!force && previewKey !== void 0 && !servedCatalogPreviews.has(previewKey)) {
          const cached2 = activeSource === void 0 ? void 0 : cachedCatalogResponse(settingsScope.get().catalogCache, activeSource, localeKey);
          if (cached2 !== void 0) {
            servedCatalogPreviews.add(previewKey);
            if (!signal.aborted && !res.destroyed) sendJson(res, 200, cached2);
            return;
          }
        }
        let index;
        try {
          index = await service.scanCatalog(signal, {
            force,
            ...locale === null || locale === "" ? {} : { locale },
            ...scope2 === void 0 ? {} : { expectedSourceRecordId: scope2.sourceRecordId }
          });
        } catch (cause) {
          if (!signal.aborted && !res.destroyed) sendCatalogFailure(res, cause);
          return;
        }
        signal.throwIfAborted();
        const response = buildCatalogResponse(index, query, scope2);
        if (!signal.aborted && !res.destroyed) sendJson(res, 200, response);
        if (previewKey !== void 0 && previewSourceRecordId !== void 0 && index !== void 0 && !generationController.signal.aborted) {
          servedCatalogPreviews.add(previewKey);
          void persistCatalogResponse(response, previewSourceRecordId, localeKey);
        }
      } catch {
        if (refreshPreviewKey !== void 0) servedCatalogPreviews.delete(refreshPreviewKey);
        if (!signal.aborted && !res.destroyed) sendJson(res, 400, { error: "invalid catalog query" });
      } finally {
        stopWatching();
      }
    } }),
    ctx.webServer.register({ kind: "exact", path: ROUTE_ASSETS, handler: async (req, res) => {
      if (!requestAllowed(req, expectedPort)) {
        sendJson(res, 403, { error: "market request authority rejected" });
        return;
      }
      if (req.method !== "GET") {
        sendJson(res, 405, { error: "market media requires GET" });
        return;
      }
      const requestUrl = new URL(req.url ?? "/", "http://localhost");
      const refs = requestUrl.searchParams.getAll("ref");
      const assetRef = refs.length === 1 ? refs[0] : void 0;
      if (assetRef === void 0 || !MARKET_MEDIA_ASSET_REF_PATTERN.test(assetRef)) {
        sendJson(res, 404, { error: "market media unavailable" });
        return;
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, generationController.signal]);
      const stopWatching = abortOnDisconnect(req, res, controller);
      try {
        const asset = await media.resolve(assetRef, signal);
        if (signal.aborted || res.destroyed) return;
        if (asset === void 0) {
          sendJson(res, 404, { error: "market media unavailable" });
          return;
        }
        res.setHeader("cache-control", "private, max-age=3600");
        res.setHeader("content-type", asset.contentType);
        res.setHeader("content-length", String(asset.body.byteLength));
        res.setHeader("content-disposition", "inline");
        res.setHeader("etag", asset.etag);
        res.setHeader("x-content-type-options", "nosniff");
        res.setHeader("cross-origin-resource-policy", "same-origin");
        res.setHeader("content-security-policy", "default-src 'none'; sandbox");
        res.setHeader("referrer-policy", "no-referrer");
        if (req.headers["if-none-match"] === asset.etag) {
          res.statusCode = 304;
          res.removeHeader("content-length");
          res.end();
          return;
        }
        res.statusCode = 200;
        res.end(asset.body);
      } catch {
        if (!signal.aborted && !res.destroyed) sendJson(res, 404, { error: "market media unavailable" });
      } finally {
        stopWatching();
      }
    } }),
    ctx.webServer.register({ kind: "exact", path: ROUTE_SOURCES, handler: async (req, res) => {
      if (req.method !== "POST" || !mutationAllowed(req, expectedPort)) {
        sendJson(res, 405, { error: "source changes require a local same-origin POST" });
        return;
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, generationController.signal]);
      const stopWatching = abortOnDisconnect(req, res, controller);
      try {
        const mutation = asMutation(await readJson(req, signal));
        await mutateSource(mutation, signal);
        if (!signal.aborted && !res.destroyed) sendJson(res, 200, { sources: await service.listSources() });
      } catch (cause) {
        if (!signal.aborted && !res.destroyed) {
          sendJson(res, 400, { error: cause instanceof Error ? cause.message : "source change failed" });
        }
      } finally {
        stopWatching();
      }
    } })
  ];
  if (desktopActionsProvider !== void 0) {
    routes.push(
      ctx.webServer.register({ kind: "exact", path: ROUTE_OPEN_TERMINAL, handler: async (req, res) => {
        if (req.method !== "POST" || !mutationAllowed(req, expectedPort)) {
          sendJson(res, 405, { error: "opening DSH Terminal requires a local same-origin POST" });
          return;
        }
        const actions = desktopActionsProvider.get();
        if (actions === void 0) {
          sendJson(res, 503, { error: "desktop actions are unavailable" });
          return;
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, generationController.signal]);
        const stopWatching = abortOnDisconnect(req, res, controller);
        try {
          asEmptyDesktopAction(await readOperationJson(req, signal));
          signal.throwIfAborted();
          actions.openTerminal();
          if (!signal.aborted && !res.destroyed) sendJson(res, 200, { ok: true });
        } catch (cause) {
          if (!signal.aborted && !res.destroyed) sendInstallError(res, cause);
        } finally {
          stopWatching();
        }
      } })
    );
  }
  if (installProvider !== void 0) {
    routes.push(
      ctx.webServer.register({ kind: "exact", path: ROUTE_INSTALLABLE, handler: async (req, res) => {
        if (req.method !== "GET" || !requestAllowed(req, expectedPort)) {
          sendJson(res, 405, { error: "market installable catalog requires a local GET" });
          return;
        }
        const install = installProvider.get();
        if (install === void 0) {
          sendJson(res, 503, { error: "market package operations are unavailable" });
          return;
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, generationController.signal]);
        const stopWatching = abortOnDisconnect(req, res, controller);
        try {
          const requestUrl = new URL(req.url ?? "/", "http://localhost");
          const localeValues = requestUrl.searchParams.getAll("locale");
          const refreshValues = requestUrl.searchParams.getAll("refresh");
          if (localeValues.length > 1 || refreshValues.length > 1 || refreshValues.length === 1 && refreshValues[0] !== "1") throw new MarketInstallError("invalid-request", "The installable catalog query was invalid.");
          const force = refreshValues.length === 1;
          const localeKey = localeValues[0] ?? "";
          const index = await service.scanCatalog(signal, {
            force,
            ...localeKey === "" ? {} : { locale: localeKey }
          });
          if (index === void 0) {
            throw new MarketInstallError("not-available", "No catalog source is active.");
          }
          const response = await install.listInstallable(index, signal);
          if (!signal.aborted && !res.destroyed) sendJson(res, 200, response);
          if (!generationController.signal.aborted) {
            servedCatalogPreviews.add(catalogPreviewKey(index.source.sourceRecordId, localeKey));
            const preview = buildCatalogResponse(
              index,
              { limit: 50, ...localeKey === "" ? {} : { locale: localeKey } },
              { sourceRecordId: index.source.sourceRecordId }
            );
            void persistCatalogResponse(preview, index.source.sourceRecordId, localeKey);
          }
        } catch (cause) {
          if (!signal.aborted && !res.destroyed) sendInstallError(res, cause);
        } finally {
          stopWatching();
        }
      } }),
      ctx.webServer.register({ kind: "exact", path: ROUTE_INSTALLATIONS, handler: async (req, res) => {
        if (req.method !== "GET" || !requestAllowed(req, expectedPort)) {
          sendJson(res, 405, { error: "market installations require a local GET" });
          return;
        }
        const install = installProvider.get();
        const desktopPlugins = desktopPluginsProvider?.get();
        if (install === void 0 || desktopPlugins === void 0) {
          sendJson(res, 503, { error: "market package operations are unavailable" });
          return;
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, generationController.signal]);
        const stopWatching = abortOnDisconnect(req, res, controller);
        try {
          const installations = reconcileInstallations(await install.listVerifiedReceipts(signal), desktopPlugins.list());
          // 更新可用性（#161）：checkUpdates 依赖 candidates 缓存，而该缓存只在目录
          // 扫描或 installable 视图填充。这里主动复用一次扫描（5 分钟缓存兜底）补
          // candidates，再把 updateAvailable/latestVersion 合并进已装列表，供 installed
          // 视图渲染「更新」按钮。目录扫描失败不阻断已装列表本身（仍返回无更新信息）。
          const updates = [];
          try {
            const index = await service.scanCatalog(signal, {});
            if (index !== void 0) {
              await install.listInstallable(index, signal);
              updates.push(...await install.checkUpdates(signal));
            }
          } catch (cause) {
            signal.throwIfAborted();
          }
          const merged = mergeInstallationUpdates(installations, updates);
          if (!signal.aborted && !res.destroyed) sendJson(res, 200, { installations: merged });
        } catch (cause) {
          if (!signal.aborted && !res.destroyed) sendInstallError(res, cause);
        } finally {
          stopWatching();
        }
      } }),
      ctx.webServer.register({ kind: "exact", path: ROUTE_OPERATION_PREVIEW, handler: async (req, res) => {
        if (req.method !== "POST" || !mutationAllowed(req, expectedPort)) {
          sendJson(res, 405, { error: "market package previews require a local same-origin POST" });
          return;
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, generationController.signal]);
        const stopWatching = abortOnDisconnect(req, res, controller);
        try {
          const request = asOperationPreview(await readOperationJson(req, signal));
          if (request.action === "disable" || request.action === "enable") {
            const desktopPlugins = desktopPluginsProvider?.get();
            const install = installProvider.get();
            if (desktopPlugins === void 0 || install === void 0) {
              throw new MarketInstallError("not-available", "Desktop plugin management is unavailable.");
            }
            const inventory = desktopPlugins.list();
            const target = inventory.find((bundle) => bundle.bundleId === request.bundleId);
            if (target === void 0) {
              throw new MarketInstallError("not-available", "The selected plugin bundle is no longer available.");
            }
            const expectedStatus = request.action === "disable" ? "active" : "disabled";
            if (!target.mutable || target.status !== expectedStatus) {
              throw new MarketInstallError(
                "conflict",
                request.action === "disable" ? "The selected plugin bundle can no longer be disabled." : "The selected plugin bundle can no longer be enabled."
              );
            }
            const matchingReceipts = (await install.listVerifiedReceipts(signal)).filter((receipt) => receipt.packageName === target.packageName);
            const packageBundleCount = inventory.filter((bundle) => bundle.packageName === target.packageName).length;
            const managedReceipt = matchingReceipts.length === 1 && packageBundleCount === 1 ? matchingReceipts[0] : void 0;
            if (matchingReceipts.length > 0 && managedReceipt === void 0) {
              throw new MarketInstallError("conflict", "The selected plugin bundle ownership is ambiguous.");
            }
            let preview;
            try {
              preview = request.action === "disable" ? desktopPlugins.previewDisable(request.bundleId) : desktopPlugins.previewEnable(request.bundleId);
            } catch {
              throw new MarketInstallError(
                "conflict",
                request.action === "disable" ? "The selected plugin bundle can no longer be disabled." : "The selected plugin bundle can no longer be enabled."
              );
            }
            const expiresAt = Date.parse(preview.expiresAt);
            if (!boundedIdentifier(preview.previewId) || !boundedIdentifier(preview.profileName) || !boundedIdentifier(preview.packageName) || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) throw new MarketInstallError(
              "operation-failed",
              request.action === "disable" ? "The desktop plugin disable preview was invalid." : "The desktop plugin enable preview was invalid."
            );
            if (preview.packageName !== target.packageName) {
              throw new MarketInstallError("conflict", "The selected plugin bundle changed during preview.");
            }
            if (request.action === "disable") {
              rememberDisablePreview(
                preview.previewId,
                expiresAt,
                request.bundleId,
                preview.packageName,
                managedReceipt?.receiptId
              );
            } else {
              rememberEnablePreview(
                preview.previewId,
                expiresAt,
                request.bundleId,
                preview.packageName,
                managedReceipt?.receiptId
              );
            }
            if (!signal.aborted && !res.destroyed) {
              sendJson(res, 200, {
                action: request.action,
                profileName: preview.profileName,
                packageName: preview.packageName,
                displayName: preview.packageName,
                expiresAt: preview.expiresAt,
                previewId: preview.previewId
              });
            }
          } else {
            const install = installProvider.get();
            if (install === void 0) {
              throw new MarketInstallError("not-available", "Market package operations are unavailable.");
            }
            const preview = request.action === "install" ? await install.previewInstall(request.sourceRecordId, request.itemId, signal) : request.action === "update" ? await install.previewUpdate(request.receiptId, signal) : await install.previewUninstall(request.receiptId, signal);
            const { intent, ...summary } = preview;
            if (!signal.aborted && !res.destroyed) sendJson(res, 200, { ...summary, previewId: intent });
          }
        } catch (cause) {
          if (!signal.aborted && !res.destroyed) sendInstallError(res, cause);
        } finally {
          stopWatching();
        }
      } }),
      ctx.webServer.register({ kind: "exact", path: ROUTE_OPERATION_EXECUTE, handler: async (req, res) => {
        if (req.method !== "POST" || !mutationAllowed(req, expectedPort)) {
          sendJson(res, 405, { error: "market package execution requires a local same-origin POST" });
          return;
        }
        const controller = new AbortController();
        const signal = AbortSignal.any([controller.signal, generationController.signal]);
        const stopWatching = abortOnDisconnect(req, res, controller);
        try {
          const previewId = asOperationExecute(await readOperationJson(req, signal));
          purgeDesktopTokens();
          let result;
          const disablePreview = disablePreviews.get(previewId);
          const enablePreview = enablePreviews.get(previewId);
          if (disablePreview !== void 0 || enablePreview !== void 0) {
            disablePreviews.delete(previewId);
            enablePreviews.delete(previewId);
            const desktopPreview = disablePreview ?? enablePreview;
            const action = disablePreview === void 0 ? "enable" : "disable";
            const desktopPlugins = desktopPluginsProvider?.get();
            const install = installProvider.get();
            if (desktopPlugins === void 0 || install === void 0) {
              throw new MarketInstallError("not-available", "Desktop plugin management is unavailable.");
            }
            const currentInventory = desktopPlugins.list();
            const currentTarget = currentInventory.find((bundle) => bundle.bundleId === desktopPreview.bundleId);
            const expectedStatus = action === "disable" ? "active" : "disabled";
            if (currentTarget === void 0 || currentTarget.packageName !== desktopPreview.packageName || !currentTarget.mutable || currentTarget.status !== expectedStatus) {
              throw new MarketInstallError(
                "conflict",
                action === "disable" ? "The selected plugin bundle changed before it could be disabled." : "The selected plugin bundle changed before it could be enabled."
              );
            }
            const matchingReceipts = (await install.listVerifiedReceipts(generationController.signal)).filter((receipt) => receipt.packageName === desktopPreview.packageName);
            if (action === "disable") {
              const packageBundleCount = currentInventory.filter((bundle) => bundle.packageName === desktopPreview.packageName).length;
              const ownershipUnchanged = desktopPreview.receiptId === void 0 ? matchingReceipts.length === 0 : packageBundleCount === 1 && matchingReceipts.length === 1 && matchingReceipts[0]?.receiptId === desktopPreview.receiptId;
              if (!ownershipUnchanged) {
                throw new MarketInstallError("conflict", "The selected plugin ownership changed before it could be disabled.");
              }
            }
            if (action === "enable") {
              const receiptUnchanged = desktopPreview.receiptId === void 0 ? matchingReceipts.length === 0 : matchingReceipts.length === 1 && matchingReceipts[0]?.receiptId === desktopPreview.receiptId;
              if (!receiptUnchanged) {
                throw new MarketInstallError("conflict", "The selected plugin ownership changed before it could be enabled.");
              }
            }
            let changed;
            try {
              changed = action === "disable" ? await desktopPlugins.executeDisable(previewId) : await desktopPlugins.executeEnable(previewId);
            } catch {
              throw new MarketInstallError(
                "conflict",
                action === "disable" ? "The selected plugin bundle changed before it could be disabled." : "The selected plugin bundle changed before it could be enabled."
              );
            }
            if (!boundedIdentifier(changed.packageName) || changed.packageName !== desktopPreview.packageName) {
              throw new MarketInstallError(
                "operation-failed",
                action === "disable" ? "The desktop plugin disable result was invalid." : "The desktop plugin enable result was invalid."
              );
            }
            const restartToken = randomUUID3();
            rememberDesktopToken(desktopPluginRestartTokens, restartToken, Date.now() + 5 * 60 * 1e3);
            result = { action, packageName: changed.packageName, restartToken };
          } else {
            const install = installProvider.get();
            if (install === void 0) {
              throw new MarketInstallError("not-available", "Market package operations are unavailable.");
            }
            result = await install.executePreview(previewId, generationController.signal);
          }
          if (!signal.aborted && !res.destroyed) sendJson(res, 200, result);
        } catch (cause) {
          if (!signal.aborted && !res.destroyed) sendInstallError(res, cause);
        } finally {
          stopWatching();
        }
      } })
    );
  }
  if (desktopActionsProvider !== void 0) {
    routes.push(ctx.webServer.register({ kind: "exact", path: ROUTE_REQUEST_RESTART, handler: async (req, res) => {
      if (req.method !== "POST" || !mutationAllowed(req, expectedPort)) {
        sendJson(res, 405, { error: "requesting a restart requires a local same-origin POST" });
        return;
      }
      const actions = desktopActionsProvider.get();
      if (actions === void 0) {
        sendJson(res, 503, { error: "desktop restart is unavailable" });
        return;
      }
      const controller = new AbortController();
      const signal = AbortSignal.any([controller.signal, generationController.signal]);
      const stopWatching = abortOnDisconnect(req, res, controller);
      try {
        const restartToken = asRestartToken(await readOperationJson(req, signal));
        signal.throwIfAborted();
        purgeDesktopTokens();
        if (!desktopPluginRestartTokens.delete(restartToken)) {
          const install = installProvider?.get();
          if (install === void 0) {
            throw new MarketInstallError("intent-expired", "The restart confirmation expired or was already used.");
          }
          install.consumeRestartToken(restartToken);
        }
        if (!res.destroyed) sendJson(res, 200, { ok: true });
        try {
          void actions.requestRestart().catch(() => {
            ctx.logger.error("dsh-community-market: desktop restart request failed");
          });
        } catch {
          ctx.logger.error("dsh-community-market: desktop restart request failed");
        }
      } catch (cause) {
        if (!signal.aborted && !res.destroyed) sendInstallError(res, cause);
      } finally {
        stopWatching();
      }
    } }));
  }
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    generationController.abort(new DOMException("Market plugin generation was disposed", "AbortError"));
    disablePreviews.clear();
    enablePreviews.clear();
    desktopPluginRestartTokens.clear();
    media.dispose();
    routes.forEach((dispose) => dispose());
  };
}
function registerMarketSettings(ctx) {
  return ctx.settings.register(MARKET_SETTINGS_NAMESPACE, SETTINGS_SCHEMA, { applies: "live" });
}
var marketRoutes = {
  state: ROUTE_STATE,
  sources: ROUTE_SOURCES,
  catalog: ROUTE_CATALOG,
  installable: ROUTE_INSTALLABLE,
  assets: ROUTE_ASSETS,
  installations: ROUTE_INSTALLATIONS,
  openTerminal: ROUTE_OPEN_TERMINAL,
  requestRestart: ROUTE_REQUEST_RESTART,
  operationPreview: ROUTE_OPERATION_PREVIEW,
  operationExecute: ROUTE_OPERATION_EXECUTE
};

// src/index.ts
var name = "community-market";
var inject = ["webServer", "settings"];
var npmRegistryHttp = createRestrictedHttpClient({
  // This is a compiled-in official registry hostname, never provider input.
  syntheticProxyHostnames: ["registry.npmjs.org"]
});
function apply(ctx) {
  const scope = registerMarketSettings(ctx);
  let installService;
  let desktopActions;
  let desktopPlugins;
  const installProvider = { get: () => installService };
  const desktopActionsProvider = { get: () => desktopActions };
  const desktopPluginsProvider = { get: () => desktopPlugins };
  ctx.effect(
    () => registerMarketRoutes(ctx, scope, installProvider, desktopActionsProvider, desktopPluginsProvider),
    "community-market: routes"
  );
  ctx.inject(["desktopActions"], (desktopCtx) => {
    const actions = desktopCtx.get("desktopActions");
    desktopCtx.effect(() => {
      desktopActions = actions;
      return () => {
        if (desktopActions === actions) desktopActions = void 0;
      };
    }, "community-market: optional desktop actions");
  });
  ctx.inject(["desktopPlugins"], (desktopCtx) => {
    const plugins = desktopCtx.get("desktopPlugins");
    desktopCtx.effect(() => {
      desktopPlugins = plugins;
      return () => {
        if (desktopPlugins === plugins) desktopPlugins = void 0;
      };
    }, "community-market: optional desktop plugin management");
  });
  ctx.inject(["desktopProfiles", "desktopPnpm"], (desktopCtx) => {
    const profiles = desktopCtx.get("desktopProfiles");
    const pnpm = desktopCtx.get("desktopPnpm");
    desktopCtx.effect(() => {
      const service = new MarketInstallService(
        scope,
        () => profiles.current,
        pnpm,
        createNpmRegistryVerifier(npmRegistryHttp),
        {
          disabledPackageNames: () => {
            const plugins = desktopPlugins;
            if (plugins === void 0) {
              throw new Error("desktop plugin policy unavailable");
            }
            return plugins.disabledPackageNames();
          }
        }
      );
      installService = service;
      return () => {
        if (installService === service) installService = void 0;
        service.dispose();
      };
    }, "community-market: desktop package operations");
  });
}
// 纯函数面（仅测试消费；loader 只认 name/inject/apply，多余导出无副作用）。
const __internals = {
  MarketInstallService,
  MarketInstallError,
  createNpmRegistryVerifier,
  stableExactVersion,
  marketManagedPackage,
  candidateKey2,
  reconcileInstallations,
  mergeInstallationUpdates,
  packageManagerDetail,
  packageManagerFailure,
  packageManagerError
};
export {
  BUILT_IN_PROVIDERS,
  CatalogContractError,
  DefaultCatalogService,
  apply,
  applyScopedCatalogCursor,
  catalogIdentityChoices,
  dsh1024StoreAdapter,
  dshfindAdapter,
  inject,
  marketRoutes,
  name,
  normalizeCatalogQuery,
  normalizePackageIdentity,
  normalizeRepositoryIdentity,
  parseCatalogProviderPage,
  parseCatalogQuery,
  parseCatalogSnapshot,
  parseCatalogSource,
  scopeCatalogCursor,
  serializeCatalogQuery,
  validateLocalSourceRecords,
  __internals
};
//# sourceMappingURL=index.js.map
