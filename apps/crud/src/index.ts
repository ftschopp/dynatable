import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  Table,
  createDynamoDBLogger,
  InferModelFromSchema,
  ArrayItem,
} from '@ftschopp/dynatable-core';

// ========================================
// Configure DynamoDB Logger
// ========================================
// Create a logger to see the exact parameters sent to DynamoDB
const logger = createDynamoDBLogger({
  enabled: true, // Enable/disable logging
  logParams: true, // Show request parameters
  logResponse: false, // Show responses (generates a lot of output)
});

/**
 * DynamoDB Schema for Instagram Clone
 *
 * Single Table Design with the following access patterns:
 * - Get User by username
 * - Get Photo by username and photoId
 * - List Photos by User (reverse chronological)
 * - Like a Photo (enforce uniqueness per user)
 * - List Likes for a Photo (chronological by likeId)
 * - Comment on a Photo
 * - List Comments for a Photo
 * - Follow a User
 * - List Followers of a User
 * - List Users followed by a User
 */

const InstagramSchema = {
  format: 'dynatable:1.0.0',
  version: '1.0.0',
  indexes: {
    primary: { hash: 'PK', sort: 'SK' },
    gsi1: { hash: 'GSI1PK', sort: 'GSI1SK' },
  },
  models: {
    User: {
      key: {
        PK: { type: String, value: 'USER#${username}' },
        SK: { type: String, value: 'USER#${username}' },
      },
      attributes: {
        username: { type: String, required: true },
        name: { type: String, required: true },
        followerCount: { type: Number, default: 0 },
        followingCount: { type: Number, default: 0 },
      },
    },

    Photo: {
      key: {
        PK: { type: String, value: 'UP#${username}' },
        SK: { type: String, value: 'PHOTO#${photoId}' },
      },
      attributes: {
        username: { type: String, required: true },
        photoId: { type: String, generate: 'ulid' },
        url: { type: String, required: true },
        likesCount: { type: Number, default: 0 },
        commentCount: { type: Number, default: 0 },
      },
    },

    Like: {
      key: {
        PK: { type: String, value: 'PL#${photoId}' },
        SK: { type: String, value: 'LIKE#${likingUsername}' },
      },
      index: {
        GSI1PK: { type: String, value: 'PL#${photoId}' },
        GSI1SK: { type: String, value: 'LIKE#${likeId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        likingUsername: { type: String, required: true },
        likeId: { type: String, generate: 'ulid' },
      },
    },

    Comment: {
      key: {
        PK: { type: String, value: 'PC#${photoId}' },
        SK: { type: String, value: 'COMMENT#${commentId}' },
      },
      attributes: {
        photoId: { type: String, required: true },
        commentId: { type: String, generate: 'ulid' },
        commentingUsername: { type: String, required: true },
        content: { type: String, required: true },
      },
    },

    Follow: {
      key: {
        PK: { type: String, value: 'FOLLOW#${followedUsername}' },
        SK: { type: String, value: 'FOLLOW#${followingUsername}' },
      },
      index: {
        GSI1PK: { type: String, value: 'FOLLOW#${followingUsername}' },
        GSI1SK: { type: String, value: 'FOLLOW#${followedUsername}' },
      },
      attributes: {
        followedUsername: { type: String, required: true },
        followingUsername: { type: String, required: true },
      },
    },

    // -----------------------------------------------------------------------
    // Story: demonstrates nested Object and Array schema support
    //
    //  frames   → Array of objects (each frame has url, duration, mediaType)
    //  location → Nested object (city, country, lat, lng)
    // -----------------------------------------------------------------------
    Story: {
      key: {
        PK: { type: String, value: 'UP#${username}' },
        SK: { type: String, value: 'STORY#${storyId}' },
      },
      attributes: {
        username: { type: String, required: true },
        storyId: { type: String, generate: 'ulid' },
        viewCount: { type: Number, default: 0 },
        // Array of objects — each slide/frame in the story
        frames: {
          type: Array,
          default: [],
          items: {
            type: Object,
            schema: {
              url: { type: String, required: true },
              duration: { type: Number }, // seconds, default handled at app layer
              mediaType: { type: String }, // 'image' | 'video'
            },
          },
        },
        // Nested object — where the story was posted from
        location: {
          type: Object,
          schema: {
            city: { type: String },
            country: { type: String },
            lat: { type: Number },
            lng: { type: Number },
          },
        },
      },
    },
  },
  params: {
    isoDates: true,
    timestamps: true,
  },
} as const;

// -----------------------------------------------------------------------
// Inferred types from the schema
// -----------------------------------------------------------------------
type StoryEntity = InferModelFromSchema<typeof InstagramSchema, 'Story'>;

// Extract the item type of the frames array directly from the schema
type StoryFrame = ArrayItem<StoryEntity['frames']>;
// → { url: string; duration?: number; mediaType?: string }

// Configuration for DynamoDB Local
const ddbClient = new DynamoDBClient({
  endpoint: 'http://localhost:8000',
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  },
});

// IMPORTANT: Dynatable requires DynamoDBDocumentClient to work with real DynamoDB
// The DocumentClient does automatic marshalling/unmarshalling between JS and DynamoDB
const client = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

const table = new Table({
  name: 'InstagramClone',
  client: client as any,
  schema: InstagramSchema,
  logger, // Pass the logger created above
});

// ========================================
// Examples CRUD - Instagram Clone
// ========================================

async function runExamples() {
  console.log('\n🚀 Starting Instagram Clone CRUD Examples\n');

  try {
    // ========================================
    // 1. CREATE - Crear Usuarios
    // ========================================
    console.log('📝 1. Creating Users...');

    // TypeScript correctly infers the input type - timestamps are auto-generated
    // ✅ This works: { username, name }
    // ❌ This would error: { username, name, createdAt, updatedAt }
    const user1 = await table.entities.User.put({
      username: 'johndoe',
      name: 'John Doe',
      // createdAt/updatedAt are NOT allowed here - they're auto-generated!
    }).execute();

    // TypeScript correctly infers the output type - includes timestamps
    // user1 has type: { username, name, followerCount, followingCount, createdAt, updatedAt }
    console.log('✅ Created user:', user1);
    console.log('   - username:', user1.username); // ✅ Typed as string
    console.log('   - createdAt:', user1.createdAt); // ✅ Typed as string (auto-generated)

    const user2 = await table.entities.User.put({
      username: 'janedoe',
      name: 'Jane Doe',
    }).execute();
    console.log('✅ Created user:', user2);

    const user3 = await table.entities.User.put({
      username: 'alice',
      name: 'Alice Smith',
    }).execute();
    console.log('✅ Created user:', user3);

    // ========================================
    // 2. READ - Leer Usuario
    // ========================================
    console.log('\n📖 2. Reading User...');

    const fetchedUser = await table.entities.User.get({
      username: 'johndoe',
    }).execute();
    console.log('✅ Fetched user:', fetchedUser);

    // ========================================
    // 3. CREATE - Crear Fotos
    // ========================================
    console.log('\n📸 3. Creating Photos...');

    // TypeScript correctly infers: photoId is auto-generated (ULID)
    // ✅ Input: { username, url }
    // ❌ NOT allowed: { username, url, photoId, createdAt, updatedAt }
    const photo1 = await table.entities.Photo.put({
      username: 'johndoe',
      url: 'https://example.com/photo1.jpg',
    }).execute();

    // Output includes all generated fields
    console.log('✅ Created photo:', photo1);
    console.log('   - photoId:', photo1.photoId); // ✅ Auto-generated ULID
    console.log('   - likesCount:', photo1.likesCount); // ✅ Default: 0
    console.log('   - createdAt:', photo1.createdAt); // ✅ Auto-generated timestamp

    const photo2 = await table.entities.Photo.put({
      username: 'johndoe',
      url: 'https://example.com/photo2.jpg',
    }).execute();
    console.log('✅ Created photo:', photo2);

    const photo3 = await table.entities.Photo.put({
      username: 'janedoe',
      url: 'https://example.com/photo3.jpg',
    }).execute();
    console.log('✅ Created photo:', photo3);

    // ========================================
    // 4. QUERY - Listar Fotos de un Usuario
    // ========================================
    console.log('\n🔍 4. Querying Photos by User...');

    const johnsPhotos = await table.entities.Photo.query()
      .where((attr, op) => op.eq(attr.username, 'johndoe'))
      .execute();
    console.log(`✅ Found ${johnsPhotos.length} photos for johndoe:`, johnsPhotos);

    // ========================================
    // 5. CREATE - Likes
    // ========================================
    console.log('\n❤️  5. Creating Likes...');

    const like1 = await table.entities.Like.put({
      photoId: photo1.photoId,
      likingUsername: 'janedoe',
    }).execute();
    console.log('✅ Created like:', like1);

    const like2 = await table.entities.Like.put({
      photoId: photo1.photoId,
      likingUsername: 'alice',
    }).execute();
    console.log('✅ Created like:', like2);

    // ========================================
    // 6. QUERY - Listar Likes de una Foto
    // ========================================
    console.log('\n🔍 6. Querying Likes for a Photo...');

    const likesForPhoto = await table.entities.Like.query()
      .where((attr, op) => op.eq(attr.photoId, photo1.photoId))
      .execute();
    console.log(`✅ Found ${likesForPhoto.length} likes for photo:`, likesForPhoto);

    // ========================================
    // 7. UPDATE - Actualizar contador de likes
    // ========================================
    console.log('\n✏️  7. Updating Photo like count...');

    const updatedPhoto = await table.entities.Photo.update({
      username: 'johndoe',
      photoId: photo1.photoId,
    })
      .set('likesCount', 2)
      .execute();
    console.log('✅ Updated photo:', updatedPhoto);

    // ========================================
    // 8. CREATE - Comentarios
    // ========================================
    console.log('\n💬 8. Creating Comments...');

    const comment1 = await table.entities.Comment.put({
      photoId: photo1.photoId,
      commentingUsername: 'janedoe',
      content: 'Great photo!',
    }).execute();
    console.log('✅ Created comment:', comment1);

    const comment2 = await table.entities.Comment.put({
      photoId: photo1.photoId,
      commentingUsername: 'alice',
      content: 'Love it!',
    }).execute();

    console.log('✅ Created comment:', comment2);

    // ========================================
    // 9. QUERY - Listar Comentarios de una Foto
    // ========================================
    console.log('\n🔍 9. Querying Comments for a Photo...');

    const commentsForPhoto = await table.entities.Comment.query()
      .where((attr, op) => op.eq(attr.photoId, photo1.photoId))
      .execute();
    console.log(`✅ Found ${commentsForPhoto.length} comments:`, commentsForPhoto);

    // ========================================
    // 10. CREATE - Follows
    // ========================================
    console.log('\n👥 10. Creating Follows...');

    const follow1 = await table.entities.Follow.put({
      followedUsername: 'johndoe',
      followingUsername: 'janedoe',
    }).execute();
    console.log('✅ janedoe follows johndoe:', follow1);

    const follow2 = await table.entities.Follow.put({
      followedUsername: 'johndoe',
      followingUsername: 'alice',
    }).execute();
    console.log('✅ alice follows johndoe:', follow2);

    // ========================================
    // 11. QUERY - Listar Followers
    // ========================================
    console.log('\n🔍 11. Querying Followers...');

    const followers = await table.entities.Follow.query()
      .where((attr, op) => op.eq(attr.followedUsername, 'johndoe'))
      .execute();
    console.log(`✅ johndoe has ${followers.length} followers:`, followers);

    // ========================================
    // 12. SCAN - Listar todos los usuarios
    // ========================================
    console.log('\n🔍 12. Scanning all Users...');

    const allUsers = await table.entities.User.scan().execute();
    console.log(`✅ Found ${allUsers.length} total users:`, allUsers);

    // ========================================
    // 13. UPDATE with ADD - Incrementar follower count
    // ========================================
    console.log('\n✏️  13. Incrementing follower count...');

    const userWithMoreFollowers = await table.entities.User.update({
      username: 'johndoe',
    })
      .add('followerCount', 2)
      .execute();
    console.log('✅ Updated user follower count:', userWithMoreFollowers);

    // ========================================
    // 14. PAGINATION - Photo pagination
    // ========================================
    console.log('\n📄 14. Testing Pagination...');

    // Create more photos to test pagination
    for (let i = 0; i < 5; i++) {
      await table.entities.Photo.put({
        username: 'johndoe',
        url: `https://example.com/photo-bulk-${i}.jpg`,
      }).execute();
    }

    const firstPage = await table.entities.Photo.query()
      .where((attr, op) => op.eq(attr.username, 'johndoe'))
      .limit(3)
      .execute();
    console.log(`✅ First page (limit 3): ${firstPage.length} items`);

    // ========================================
    // 15. CONDITIONAL PUT - Put solo si NO existe
    // ========================================
    console.log('\n🔐 15. Conditional Put (prevent overwrite)...');

    try {
      await table.entities.User.put({
        username: 'johndoe',
        name: 'This Should Fail',
      })
        .ifNotExists()
        .execute();
      console.log("❌ Should have failed but didn't");
    } catch (error: any) {
      console.log('✅ Conditional put correctly prevented overwrite:', error.message);
    }

    // ========================================
    // 16. DELETE - Eliminar un Like
    // ========================================
    console.log('\n🗑️  16. Deleting a Like...');

    await table.entities.Like.delete({
      photoId: photo1.photoId,
      likingUsername: 'alice',
    }).execute();
    console.log('✅ Deleted like from alice');

    // Verify it was deleted
    const remainingLikes = await table.entities.Like.query()
      .where((attr, op) => op.eq(attr.photoId, photo1.photoId))
      .execute();
    console.log(`✅ Remaining likes: ${remainingLikes.length}`, remainingLikes);

    // ========================================
    // 17. TRANSACTION - Create Like and update likes counter atomically
    // ========================================
    console.log('\n⚡ 17. Transaction: Like a photo (atomic)...');

    // Obtener una foto para hacer like
    const photosForLike = await table.entities.Photo.query()
      .where((attr, op) => op.eq(attr.username, 'johndoe'))
      .limit(1)
      .execute();

    if (photosForLike.length > 0) {
      const photoToLike = photosForLike[0]!;
      const currentLikes = photoToLike.likesCount || 0;

      console.log(`  Photo: ${photoToLike.photoId}, Current likes: ${currentLikes}`);

      // Atomic transaction: create like + increment counter
      await table
        .transactWrite()
        .addPut(
          table.entities.Like.put({
            photoId: photoToLike.photoId,
            likingUsername: 'transactuser',
          }).dbParams()
        )
        .addUpdate(
          table.entities.Photo.update({
            username: photoToLike.username,
            photoId: photoToLike.photoId,
          })
            .add('likesCount', 1) // Atomically increments
            .dbParams()
        )
        .execute();

      console.log('✅ Transaction completed: Like created + counter incremented');

      // Verificar el resultado
      const updatedPhoto = await table.entities.Photo.get({
        username: photoToLike.username,
        photoId: photoToLike.photoId,
      }).execute();

      console.log(`  New likes count: ${updatedPhoto?.likesCount || 0}`);

      // Verify the like was created
      const createdLike = await table.entities.Like.get({
        photoId: photoToLike.photoId,
        likingUsername: 'transactuser',
      }).execute();

      console.log('  Created like:', createdLike);
    } else {
      console.log('⚠️  No photos found to like');
    }

    // ========================================
    // 18. QUERY with filters - Advanced search
    // ========================================
    console.log('\n🔍 18. Query with Filters...');

    const popularPhotos = await table.entities.Photo.query()
      .where((attr, op) => op.and(op.eq(attr.username, 'johndoe'), op.gte(attr.likesCount, 1)))
      .execute();
    console.log(`✅ Found ${popularPhotos.length} popular photos (likes >= 1)`);

    // ========================================
    // 19. NESTED OBJECT & ARRAY — Stories
    // ========================================
    console.log('\n📖 19. Stories — nested Object & Array examples...');

    // PUT: story with frames (Array of objects) and location (nested Object)
    // StoryFrame type is inferred from the schema: { url: string; duration?: number; mediaType?: string }
    const frames: StoryFrame[] = [
      { url: 'https://cdn.example.com/s1f1.jpg', duration: 5, mediaType: 'image' },
      { url: 'https://cdn.example.com/s1f2.mp4', duration: 10, mediaType: 'video' },
    ];

    const story1 = await table.entities.Story.put({
      username: 'johndoe',
      frames,
      location: { city: 'Buenos Aires', country: 'AR', lat: -34.6, lng: -58.38 },
    }).execute();

    console.log('✅ Created story with frames and location:');
    console.log('   storyId:', story1.storyId); // auto-generated ULID
    console.log('   frames:', story1.frames);
    console.log('   location:', story1.location);

    // PUT: story with only frames, no location
    const story2 = await table.entities.Story.put({
      username: 'janedoe',
      frames: [{ url: 'https://cdn.example.com/s2f1.jpg', mediaType: 'image' }],
    }).execute();

    console.log('✅ Created story (no location):', story2.storyId);
    console.log('   frames count:', story2.frames?.length);
    console.log('   location:', story2.location); // undefined — optional field

    // GET: retrieve the story and access nested fields
    const fetchedStory = await table.entities.Story.get({
      username: 'johndoe',
      storyId: story1.storyId,
    }).execute();

    console.log('✅ Fetched story — first frame url:', fetchedStory?.frames?.[0]?.url);
    console.log('   location.city:', fetchedStory?.location?.city);

    // UPDATE: increment view count while keeping nested fields intact
    const updatedStory = await table.entities.Story.update({
      username: 'johndoe',
      storyId: story1.storyId,
    })
      .add('viewCount', 1)
      .execute();

    console.log('✅ Updated story viewCount:', updatedStory?.viewCount);

    // QUERY: list all stories for a user (same PK pattern as Photos)
    const johnsStories = await table.entities.Story.query()
      .where((attr, op) => op.eq(attr.username, 'johndoe'))
      .execute();

    console.log(`✅ Found ${johnsStories.length} stories for johndoe`);
    johnsStories.forEach((s, i) => {
      console.log(`   Story ${i + 1}: ${s.frames?.length ?? 0} frames, viewCount: ${s.viewCount}`);
    });

    console.log('\n✨ All CRUD examples completed successfully!\n');

    // ========================================
    // RESUMEN FINAL
    // ========================================
    console.log('📊 Final Summary:');
    const finalUsers = await table.entities.User.scan().execute();
    const finalPhotos = await table.entities.Photo.scan().execute();
    const finalLikes = await table.entities.Like.scan().execute();
    const finalComments = await table.entities.Comment.scan().execute();
    const finalFollows = await table.entities.Follow.scan().execute();

    console.log(`  Users: ${finalUsers.length}`);
    console.log(`  Photos: ${finalPhotos.length}`);
    console.log(`  Likes: ${finalLikes.length}`);
    console.log(`  Comments: ${finalComments.length}`);
    console.log(`  Follows: ${finalFollows.length}`);
    console.log('\n');
  } catch (error) {
    console.error('❌ Error running examples:', error);
    process.exit(1);
  }
}

// Ejecutar ejemplos si se corre directamente
if (require.main === module) {
  runExamples()
    .then(() => {
      console.log('👋 Bye!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}
