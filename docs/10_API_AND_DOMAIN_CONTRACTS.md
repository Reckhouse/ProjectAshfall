# 10 — API and Domain Contracts

## General command envelope

Future mutation requests should use:

```json
{
  "actionId": "uuid",
  "payload": {}
}
```

The server derives `playerId` from the authenticated session.

Never accept `playerId` as proof of authority.

## Phase 1 conceptual endpoints

### Provision player

```http
POST /api/game/provision
```

Input:
```json
{
  "actionId": "uuid"
}
```

Server:
- verifies session
- finds auth user
- calls `ensurePlayerProvisioned`
- returns safe player snapshot

### Player snapshot

```http
GET /api/game/me
```

Returns:
```json
{
  "player": {
    "status": "ACTIVE",
    "world": "ashfall-01",
    "base": { "x": 138, "y": 742 },
    "resources": {
      "energy": 250,
      "metal": 150
    }
  }
}
```

No secret world seed is returned.

## Future move

```http
POST /api/game/move
```

Input:
```json
{
  "actionId": "uuid",
  "payload": {
    "direction": "north"
  }
}
```

Server derives:
- current location
- target
- terrain validity
- movement cost
- final position
- events

## Future resource collect

Input should identify a node/action, never the yield amount.

Good:

```json
{
  "nodeId": "node_123"
}
```

Bad:

```json
{
  "nodeId": "node_123",
  "metalReward": 10000
}
```

## Future cave clear

Client may submit:
- cave ID
- action ID

Server derives:
- player eligibility
- troop strength
- cave tier
- success
- casualties
- tool reward

## DTO principle

Return only data necessary for the player UI.

Do not expose:
- hidden cave roll seed
- secret world generation seed
- anti-cheat flags
- other player's private inventories
