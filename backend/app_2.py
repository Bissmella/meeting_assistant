from flask import Flask

# Create the application instance
app = Flask(__name__)

# Define the route for the homepage
# --- STT Mocking (Replace with actual Kyutai STT Model Logic) ---
def transcribe_audio(audio_file_data):
    """
    Simulates the transcription of an audio file using the Kyutai STT model.
    In a real application, you would load the model, process the audio buffer,
    and return the text.

    Args:
        audio_file_data: The binary data of the uploaded audio file (MP3, etc.).
    Returns:
        str: The transcribed text.
    """
    # In a real environment:
    # 1. Load the Kyutai model and dependencies (sphn, torch, etc.)
    # 2. Process audio_file_data
    # 3. return transcribed_text

    # Mock Transcripts for Demonstration:
    mock_id = len(MEETING_NOTES) + 1
    title = f"Meeting Note #{mock_id}"
    templates = [
        f"The main agenda for the {title} was Project Phoenix budget review. Sarah confirmed that the spending is 15% over target due to cloud hosting costs. Action item for Tom: Find cheaper hosting alternatives by the next sprint meeting.",
        f"During the {title} session, we finalized the marketing plan for Q3. Key audience: European remote workers. We need five new short-form videos. Mark will lead the video content creation. Decision: We are delaying the mobile app update to focus on web platform stability.",
        f"The {title} sync focused on hiring for the engineering team. Two roles are priority: Frontend Lead and DevOps Specialist. Jamie needs to close the Frontend Lead role this month. Project A is blocked until the DevOps role is filled.",
        f"The {title} recap confirmed deployment success. The only major bug reported was a minor UI glitch on Safari. Action item for the QA team: Verify all browser compatibility issues. Overall, a successful project milestone achieved."
    ]
    transcript = templates[mock_id % len(templates)]
    return transcript, title


# --- Vector Embedding & Search Simulation (Lightweight TF-IDF Approximation) ---
def tokenize(text):
    """Simple tokenizer."""
    return re.findall(r'\b\w+\b', text.lower())

def generate_embedding(text):
    """
    Generates a TF (Term Frequency) vector for the document based on the global vocabulary.
    This simulates creating a dense vector for storage and search.
    """
    tokens = tokenize(text)
    token_counts = Counter(tokens)
    
    # Update global vocabulary
    global GLOBAL_VOCABULARY
    GLOBAL_VOCABULARY.update(tokens)

    # Return the raw token frequency count as the "vector"
    return token_counts


def cosine_similarity(vec1, vec2):
    """Calculates cosine similarity between two Counter vectors (TF vectors)."""
    
    # 1. Calculate Dot Product
    intersection = set(vec1.keys()) & set(vec2.keys())
    dot_product = sum(vec1[token] * vec2[token] for token in intersection)
    
    # 2. Calculate Magnitudes
    magnitude1 = math.sqrt(sum(val**2 for val in vec1.values()))
    magnitude2 = math.sqrt(sum(val**2 for val in vec2.values()))
    
    # 3. Calculate Similarity
    if magnitude1 * magnitude2 == 0:
        return 0
    return dot_product / (magnitude1 * magnitude2)


def vector_search(query_text, k=3):
    """
    Simulates a vector search by generating a query vector and finding the
    top k most similar documents in the in-memory database.
    """
    if not MEETING_NOTES:
        return []

    # 1. Generate Query Vector
    query_vector = generate_embedding(query_text)

    # 2. Calculate Similarity for all notes
    similarities = []
    for note in MEETING_NOTES:
        # Note: The stored 'vector' is the Counter object
        similarity = cosine_similarity(query_vector, note['vector'])
        similarities.append((similarity, note))
    
    # 3. Sort and select top K results
    similarities.sort(key=lambda x: x[0], reverse=True)
    
    # Return the transcript texts of the top K results
    top_results = [note['transcript'] for score, note in similarities if score > 0][:k]
    
    print(f"Vector Search retrieved {len(top_results)} documents.")
    return top_results


# --- RAG and LLM Interaction ---
def query_gemini(user_query, context_documents):
    """
    Calls the Gemini API to answer the user query, grounded in the context documents.
    """
    # 1. Combine Context
    if not context_documents:
        context_text = "No relevant meeting notes were found for grounding the response."
    else:
        context_text = "\n\n--- Retrieved Context ---\n\n" + "\n\n".join(context_documents)
    
    # 2. Define System Instruction and Full Prompt
    system_prompt = (
        "You are a concise AI Meeting Assistant. Use ONLY the 'Retrieved Context' provided below "
        "to answer the user's question. If the answer is not present in the context, "
        "politely state: 'I could not find a relevant answer in the stored meeting notes.'"
    )
    full_prompt = f"{context_text}\n\n--- User Query ---\n\n{user_query}"

    # 3. Prepare Payload
    payload = {
        "contents": [{ "parts": [{ "text": full_prompt }] }],
        "systemInstruction": { "parts": [{ "text": system_prompt }] },
    }

    # 4. API Call with Exponential Backoff
    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = requests.post(
                GEMINI_API_URL, 
                headers={'Content-Type': 'application/json'}, 
                data=json.dumps(payload)
            )
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            
            result = response.json()
            text = result.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', 'Failed to generate response.')
            return text

        except requests.exceptions.RequestException as e:
            print(f"API Request failed (Attempt {attempt + 1}/{max_retries}): {e}")
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)  # Exponential backoff
            else:
                return "Error: Could not connect to the AI service after multiple retries."
    return "Error: Failed to get a response from the AI model."


# --- Flask API Endpoints ---

@app.route('/api/notes', methods=['GET'])
def get_notes():
    """Returns the list of stored meeting notes."""
    # Strip the vector data for cleaner JSON transfer
    clean_notes = [{k: v for k, v in note.items() if k != 'vector'} for note in MEETING_NOTES]
    return jsonify({'notes': clean_notes})


@app.route('/api/upload_chunk', methods=['POST'])
def upload_chunk():
    """
    Receives a chunked audio upload. Expects form-data with fields:
    - session_id: client-generated id grouping chunks
    - chunk_index: integer index
    - audio: binary blob file
    """
    session_id = request.form.get('session_id')
    chunk_index = request.form.get('chunk_index')

    if 'audio' not in request.files or not session_id:
        return jsonify({'error': 'Missing audio file or session_id'}), 400

    try:
        upload_dir = os.path.join('uploads', session_id)
        os.makedirs(upload_dir, exist_ok=True)

        audio_file = request.files['audio']
        # Use provided index if available, else use count
        if chunk_index is None or chunk_index == '':
            existing = len([n for n in os.listdir(upload_dir) if n.startswith('chunk_')])
            chunk_index = existing
        else:
            chunk_index = int(chunk_index)

        chunk_path = os.path.join(upload_dir, f'chunk_{chunk_index}.webm')
        audio_file.save(chunk_path)
        return jsonify({'success': True, 'chunk_index': chunk_index})
    except Exception as e:
        print('Error saving chunk:', e)
        return jsonify({'error': str(e)}), 500


@app.route('/api/finish_upload', methods=['POST'])
def finish_upload():
    """
    Assemble uploaded chunks for a session into a single audio file, run transcription
    (simulated), create the note and return it.
    Expects JSON or form-data with 'session_id'.
    """
    session_id = request.form.get('session_id') or (request.json or {}).get('session_id')
    if not session_id:
        return jsonify({'error': 'session_id required'}), 400

    upload_dir = os.path.join('uploads', session_id)
    if not os.path.isdir(upload_dir):
        return jsonify({'error': 'No chunks found for session'}), 400

    try:
        # Assemble chunks in order
        chunk_files = sorted([f for f in os.listdir(upload_dir) if f.startswith('chunk_')],
                             key=lambda x: int(x.split('_')[1].split('.')[0]))

        final_path = os.path.join(upload_dir, 'assembled.webm')
        with open(final_path, 'wb') as outfile:
            for fname in chunk_files:
                with open(os.path.join(upload_dir, fname), 'rb') as infile:
                    outfile.write(infile.read())

        # Read assembled bytes
        with open(final_path, 'rb') as f:
            audio_data = f.read()

        # 1. STT Transcription (Simulated)
        transcript, title = transcribe_audio(audio_data)

        # 2. Vector Embedding
        vector = generate_embedding(transcript)

        # 3. Store in Database
        note_id = str(len(MEETING_NOTES) + 1).zfill(4)
        new_note = {
            'id': note_id,
            'title': title,
            'transcript': transcript,
            'timestamp': time.time(),
            'vector': vector
        }
        MEETING_NOTES.append(new_note)

        # Cleanup: remove uploaded chunks and assembled file
        try:
            for fname in os.listdir(upload_dir):
                os.remove(os.path.join(upload_dir, fname))
            os.rmdir(upload_dir)
        except Exception:
            pass

        return jsonify({'success': True, 'note': {k: v for k, v in new_note.items() if k != 'vector'}})

    except Exception as e:
        print('Error assembling chunks:', e)
        return jsonify({'error': str(e)}), 500

@app.route('/api/transcribe', methods=['POST'])
def handle_transcription():
    """
    Handles audio file upload, performs simulated STT, creates vector embedding,
    and stores the result in the database.
    """
    if 'audio' not in request.files:
        return jsonify({'error': 'No audio file part in the request'}), 400
    
    audio_file = request.files['audio']
    if audio_file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    try:
        # Read the file data from the stream
        audio_data = audio_file.read() 
        
        # 1. STT Transcription (Simulated)
        transcript, title = transcribe_audio(audio_data)

        # 2. Vector Embedding
        vector = generate_embedding(transcript)
        
        # 3. Store in Database
        note_id = str(len(MEETING_NOTES) + 1).zfill(4)
        new_note = {
            'id': note_id,
            'title': title,
            'transcript': transcript,
            'timestamp': time.time(),
            'vector': vector # Store the vector (Counter object)
        }
        MEETING_NOTES.append(new_note)

        return jsonify({
            'success': True, 
            'message': 'Transcription, embedding, and storage successful.', 
            'note': {k: v for k, v in new_note.items() if k != 'vector'}
        })

    except Exception as e:
        print(f"Error during transcription/storage: {e}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500


@app.route('/api/query', methods=['POST'])
def handle_query():
    """
    Handles user chat query, performs vector search (RAG), and gets LLM response.
    """
    data = request.json
    user_query = data.get('query')

    if not user_query:
        return jsonify({'error': 'Query is required.'}), 400

    if not MEETING_NOTES:
        return jsonify({'response': 'No meetings have been recorded yet to query.'})

    try:
        # 1. Retrieval (Vector Search Simulation)
        context_docs = vector_search(user_query, k=3)
        
        # 2. Generation (LLM Call with Context)
        llm_response = query_gemini(user_query, context_docs)

        return jsonify({'response': llm_response})

    except Exception as e:
        print(f"Error during query/LLM call: {e}")
        return jsonify({'error': f'Internal server error: {str(e)}'}), 500