import { describe, it, expect, vi } from 'vitest'
import { resolveAuthors } from '../../../src/lib/resolve-authors.js'

function createMockDb(
  usersRows: Record<string, unknown>[],
  profileRows: Record<string, unknown>[]
) {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn(),
  }
  selectChain.where.mockResolvedValueOnce(usersRows).mockResolvedValueOnce(profileRows)

  return {
    select: vi.fn().mockReturnValue(selectChain),
  }
}

describe('resolveAuthors', () => {
  const didJay = 'did:plc:jay111'
  const didAlex = 'did:plc:alex222'
  const communityDid = 'did:plc:community123'

  it('returns empty map for empty DID list', async () => {
    const db = createMockDb([], [])
    const result = await resolveAuthors([], null, db as never)
    expect(result.size).toBe(0)
    expect(db.select).not.toHaveBeenCalled()
  })

  it('resolves profiles from users table with no community context', async () => {
    const db = createMockDb(
      [
        {
          did: didJay,
          handle: 'jay.bsky.team',
          displayName: 'Jay',
          avatarUrl: 'https://cdn.example.com/jay.jpg',
          bannerUrl: null,
          bio: null,
        },
        {
          did: didAlex,
          handle: 'alex.bsky.team',
          displayName: null,
          avatarUrl: null,
          bannerUrl: null,
          bio: null,
        },
      ],
      []
    )

    const result = await resolveAuthors([didJay, didAlex], null, db as never)

    expect(result.size).toBe(2)
    expect(result.get(didJay)).toEqual({
      did: didJay,
      handle: 'jay.bsky.team',
      displayName: 'Jay',
      avatarUrl: 'https://cdn.example.com/jay.jpg',
    })
    expect(result.get(didAlex)).toEqual({
      did: didAlex,
      handle: 'alex.bsky.team',
      displayName: null,
      avatarUrl: null,
    })
  })

  it('applies community profile overrides when communityDid is provided', async () => {
    const db = createMockDb(
      [
        {
          did: didJay,
          handle: 'jay.bsky.team',
          displayName: 'Jay',
          avatarUrl: 'https://cdn.example.com/jay.jpg',
          bannerUrl: null,
          bio: null,
        },
      ],
      [
        {
          did: didJay,
          communityDid,
          displayName: 'Jay in Community',
          avatarUrl: 'https://cdn.example.com/jay-community.jpg',
          bannerUrl: null,
          bio: null,
        },
      ]
    )

    const result = await resolveAuthors([didJay], communityDid, db as never)

    expect(result.get(didJay)).toEqual({
      did: didJay,
      handle: 'jay.bsky.team',
      displayName: 'Jay in Community',
      avatarUrl: 'https://cdn.example.com/jay-community.jpg',
    })
  })

  it('deduplicates DIDs before querying', async () => {
    const db = createMockDb(
      [
        {
          did: didJay,
          handle: 'jay.bsky.team',
          displayName: 'Jay',
          avatarUrl: null,
          bannerUrl: null,
          bio: null,
        },
      ],
      []
    )

    const result = await resolveAuthors([didJay, didJay, didJay], null, db as never)

    expect(result.size).toBe(1)
  })

  it('returns fallback for DIDs not found in users table', async () => {
    const db = createMockDb([], [])

    const result = await resolveAuthors([didJay], null, db as never)

    expect(result.get(didJay)).toEqual({
      did: didJay,
      handle: didJay,
      displayName: null,
      avatarUrl: null,
    })
  })
})
