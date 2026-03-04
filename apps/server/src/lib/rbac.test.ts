import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertOwnerInvariant,
  assertOwnerMutationAllowed,
  evaluateEffectiveRole,
  evaluatePermission,
  type RbacGrant,
} from "./rbac.js";

function grant(input: RbacGrant): RbacGrant {
  return input;
}

test("RBAC most-permissive resolution across global/project/folder scopes", () => {
  const grants: RbacGrant[] = [
    grant({
      role: "viewer",
      scope: { kind: "global" },
    }),
    grant({
      role: "editor",
      scope: { kind: "project", project: "marketing-site" },
    }),
    grant({
      role: "editor",
      scope: {
        kind: "folder_prefix",
        project: "marketing-site",
        environment: "staging",
        pathPrefix: "blog/",
      },
    }),
  ];

  const role = evaluateEffectiveRole(grants, {
    project: "marketing-site",
    environment: "staging",
    path: "blog/posts/launch-notes",
  });

  assert.equal(role, "editor");
});

test("RBAC folder prefix grants do not apply outside the path subtree", () => {
  const grants: RbacGrant[] = [
    grant({
      role: "editor",
      scope: {
        kind: "folder_prefix",
        project: "marketing-site",
        environment: "staging",
        pathPrefix: "blog/",
      },
    }),
    grant({
      role: "viewer",
      scope: { kind: "project", project: "marketing-site" },
    }),
  ];

  const role = evaluateEffectiveRole(grants, {
    project: "marketing-site",
    environment: "staging",
    path: "docs/adr/0001",
  });

  assert.equal(role, "viewer");
});

test("RBAC permission evaluation respects role capability mapping", () => {
  const grants: RbacGrant[] = [
    grant({
      role: "editor",
      scope: { kind: "project", project: "marketing-site" },
    }),
  ];

  const publish = evaluatePermission({
    grants,
    target: {
      project: "marketing-site",
      environment: "production",
      path: "blog/release-notes",
    },
    action: "content:publish",
  });

  const manageUsers = evaluatePermission({
    grants,
    target: {
      project: "marketing-site",
      environment: "production",
      path: "blog/release-notes",
    },
    action: "user:manage",
  });

  const unpublish = evaluatePermission({
    grants,
    target: {
      project: "marketing-site",
      environment: "production",
      path: "blog/release-notes",
    },
    action: "content:unpublish",
  });

  const deleteContent = evaluatePermission({
    grants,
    target: {
      project: "marketing-site",
      environment: "production",
      path: "blog/release-notes",
    },
    action: "content:delete",
  });

  assert.equal(publish.allowed, true);
  assert.equal(publish.effectiveRole, "editor");
  assert.equal(unpublish.allowed, true);
  assert.equal(unpublish.effectiveRole, "editor");
  assert.equal(deleteContent.allowed, true);
  assert.equal(deleteContent.effectiveRole, "editor");
  assert.equal(manageUsers.allowed, false);
  assert.equal(manageUsers.effectiveRole, "editor");
});

test("RBAC rejects non-global Owner/Admin grants", () => {
  assert.throws(() =>
    evaluateEffectiveRole(
      [
        grant({
          role: "admin",
          scope: {
            kind: "project",
            project: "marketing-site",
          },
        }),
      ],
      {
        project: "marketing-site",
      },
    ),
  );

  assert.throws(() =>
    evaluateEffectiveRole(
      [
        grant({
          role: "owner",
          scope: {
            kind: "folder_prefix",
            project: "marketing-site",
            environment: "staging",
            pathPrefix: "blog/",
          },
        }),
      ],
      {
        project: "marketing-site",
        environment: "staging",
        path: "blog/a",
      },
    ),
  );
});

test("owner invariant accepts exactly one active owner", () => {
  const snapshot = assertOwnerInvariant({
    activeOwnerCount: 1,
  });

  assert.equal(snapshot.activeOwnerCount, 1);
});

test("owner invariant rejects zero or multiple active owners", () => {
  assert.throws(() =>
    assertOwnerInvariant({
      activeOwnerCount: 0,
    }),
  );

  assert.throws(() =>
    assertOwnerInvariant({
      activeOwnerCount: 2,
    }),
  );
});

test("owner mutation guard rejects removing/demoting the last owner", () => {
  assert.throws(() =>
    assertOwnerMutationAllowed({
      activeOwnerCount: 1,
      intent: "remove_owner",
    }),
  );

  assert.throws(() =>
    assertOwnerMutationAllowed({
      activeOwnerCount: 1,
      intent: "demote_owner",
    }),
  );
});

test("owner mutation guard allows owner mutation when more than one owner exists", () => {
  assert.doesNotThrow(() =>
    assertOwnerMutationAllowed({
      activeOwnerCount: 2,
      intent: "remove_owner",
    }),
  );
});
