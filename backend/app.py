from flask import Flask

# Create the application instance
app = Flask(__name__)

# Define the route for the homepage
@app.route('/')
def hello_world():
    return 'Hello, World!'

if __name__ == '__main__':
    # This runs the development server
    app.run(debug=True)