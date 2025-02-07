from quart import Quart, render_template, jsonify, Response, request
import yt_dlp
import random
import asyncio
from datetime import datetime, timedelta
import aiohttp
import traceback

app = Quart(__name__)

played_songs = set()
last_cache_clear = datetime.now()

COUNTRY_CODES = [
    'US', 'GB', 'CA', 'AU', 'NZ', 
    'FR', 'DE', 'ES', 'IT', 'NL',
    'JP', 'KR', 'IN', 'BR', 'RU',
    'SE', 'NO', 'DK', 'FI', 'IS'
]

async def format_views(views):
    if views >= 1000000:
        return f"{views/1000000:.1f}M views"
    elif views >= 1000:
        return f"{views/1000:.1f}K views"
    else:
        return f"{views} views"

async def get_random_song():
    global played_songs, last_cache_clear
    
    try:
        print("Starting get_random_song function")
        
        if datetime.now() - last_cache_clear > timedelta(hours=3):
            print("Clearing song cache")
            played_songs.clear()
            last_cache_clear = datetime.now()
        
        base_ydl_opts = {
            'format': 'best[height<=720]',
            'quiet': True,
            'no_warnings': True,
            'nocheckcertificate': True,
            'ignoreerrors': True,
            'geo_bypass': True,
            'no_check_certificate': True,
            'prefer_insecure': True,
            'extractor_retries': 3
        }
        
        search_query = random.choice([
            'top hits music video',
            'popular music 2024',
            'trending music video',
            'official music video',
            'new music video 2024'
        ])
        
        print(f"Searching with query: {search_query}")
        
        search_opts = {
            **base_ydl_opts,
            'extract_flat': True,
            'default_search': 'ytsearch10',
            'socket_timeout': 10,
            'quiet': True,
            'no_warnings': True,
            'extract_flat': 'in_playlist',
            'force_generic_extractor': True
        }
        
        try:
            with yt_dlp.YoutubeDL(search_opts) as ydl:
                print("Extracting search results...")
                result = await asyncio.to_thread(
                    ydl.extract_info, f"ytsearch10:{search_query}", download=False
                )
                
                if not result:
                    print("No results returned from search")
                    return None
                    
                if 'entries' not in result:
                    print("No entries in search results")
                    return None
                    
                print(f"Found {len(result['entries'])} initial results")
                
                videos = [v for v in result['entries'] 
                         if v and isinstance(v, dict)
                         and v.get('duration')
                         and 180 <= float(v.get('duration', 0)) <= 420
                         and v.get('id') not in played_songs]
                
                print(f"Filtered to {len(videos)} suitable videos")
                
                if not videos:
                    print("No suitable videos found after filtering")
                    return None
                    
                video = random.choice(videos)
                played_songs.add(video['id'])
                
                print(f"Selected video ID: {video['id']}")
                
                print("Getting detailed video info...")
                with yt_dlp.YoutubeDL(base_ydl_opts) as ydl:
                    info = await asyncio.to_thread(
                        ydl.extract_info, f"https://www.youtube.com/watch?v={video['id']}", 
                        download=False
                    )
                    
                    if not info:
                        print("Failed to get detailed video info")
                        return None

                    formats = info.get('formats', [])
                    print(f"Found {len(formats)} available formats")
                    
                    best_format = None
                    for f in formats:
                        height = f.get('height')
                        if height is not None and height <= 720 and f.get('acodec') != 'none' and f.get('vcodec') != 'none':
                            best_format = f
                            break
                    
                    if not best_format:
                        print("No suitable format found")
                        return None

                    print(f"Selected format: {best_format.get('format_id')}")
                    
                    return {
                        'id': video['id'],
                        'title': info['title'],
                        'url': best_format['url'],
                        'thumbnail': info.get('thumbnail'),
                        'duration': f"{int(float(info.get('duration', 0))) // 60}:{int(float(info.get('duration', 0))) % 60:02d}",
                        'channel': info.get('uploader', 'Unknown Artist'),
                        'youtube_url': f"https://www.youtube.com/watch?v={video['id']}",
                        'views': await format_views(info.get('view_count', 0))
                    }
                    
        except Exception as e:
            print(f"Error during YouTube search/extraction: {str(e)}")
            print(traceback.format_exc())
            return None
                
    except Exception as e:
        print(f"Error in get_random_song: {str(e)}")
        print(traceback.format_exc())
        return None

@app.route('/')
async def index():
    return await render_template('index.html')

@app.route('/get_random_song', methods=['GET'])
async def random_song():
    print("Received request for random song")
    max_attempts = 3
    for attempt in range(max_attempts):
        try:
            print(f"Attempt {attempt + 1} to get random song")
            song = await get_random_song()
            if song and song.get('url'):
                print(f"Successfully found song: {song['title']}")
                return jsonify(song)
            print(f"Attempt {attempt + 1} failed, trying again...")
        except Exception as e:
            print(f"Error on attempt {attempt + 1}: {str(e)}")
            print(traceback.format_exc())
    
    print("All attempts failed to find a song")
    return jsonify({'error': 'Could not find a suitable song'}), 404

@app.errorhandler(404)
async def not_found_error(error):
    print(f"404 Error: {error}")
    return jsonify({'error': 'Not found'}), 404

@app.errorhandler(Exception)
async def handle_exception(error):
    print(f"Unexpected error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

@app.after_request
async def after_request(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Accept'
    response.headers['Access-Control-Allow-Credentials'] = 'true'
    response.headers['Access-Control-Expose-Headers'] = 'Content-Length'
    return response

if __name__ == '__main__':
    app.run(debug=True, host='127.0.0.1', port=5000) 