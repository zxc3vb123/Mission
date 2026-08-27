/* World geometry. LANE A (world).

   The map is 4096 x 2560 pixels - far more than fits comfortably in one
   flat buffer, so it is stored as a grid of 128 x 128 chunks that are
   generated on demand around the camera and thrown away again behind it.

   Both the map width and the chunk size are powers of two on purpose: a
   pixel index is (y << XSHIFT) | x, so splitting an index back into a
   chunk and an offset inside it is a couple of shifts rather than a
   divide, and those happen millions of times a tick. */

export const XSHIFT = 12;
export const LW     = 1 << XSHIFT;          /* 4096 */
export const LH     = 2560;
export const XMASK  = LW - 1;

export const CSHIFT = 7;
export const CHUNK  = 1 << CSHIFT;          /* 128 x 128 pixels */
export const CMASK  = CHUNK - 1;
export const CW     = LW >> CSHIFT;         /* 32 chunks across */
export const CH     = LH >> CSHIFT;         /* 20 chunks down   */
export const CPIX   = CHUNK * CHUNK;        /* 16384 pixels per chunk */

/* repaint tiles: a chunk is TPC x TPC of them */
export const TS     = 32;
export const TSHIFT = 5;
export const TPC    = CHUNK / TS;           /* 4 */

/* How much world stays loaded around the camera, in pixels.
   NEED is what has to exist this instant because it is about to be drawn,
   and is deliberately tight. KEEP is the ring the prefetcher fills a chunk
   at a time; walking 128 px takes about 60 ticks, so a couple of chunks a
   tick keeps it far enough ahead that NEED almost never has to load
   anything itself. The gap between the two is also the band the simulation
   runs in, so water and sand keep moving a screen's width off camera. */
export const NEED_MARGIN = 32;
export const KEEP_MARGIN = CHUNK * 2;
export const PREFETCH_PER_TICK = 2;

/* Ticks a chunk outside the keep box survives before it may be evicted,
   and the hard ceiling on how many may be resident at once whatever the
   grace period says. See setFocus in chunks.js. */
export const EVICT_GRACE  = 90;
export const MAX_RESIDENT = 96;

export const idx = (x, y) => (y << XSHIFT) | x;
export const ixOf = i => i & XMASK;
export const iyOf = i => i >>> XSHIFT;

/* chunk index of a pixel index, and the offset inside that chunk */
export const ciOf = i => ((i >>> (XSHIFT + CSHIFT)) * CW) + ((i >>> CSHIFT) & (CW - 1));
export const liOf = i => (((i >>> XSHIFT) & CMASK) << CSHIFT) | (i & CMASK);
