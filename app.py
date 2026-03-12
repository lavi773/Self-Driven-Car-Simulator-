from flask import Flask, jsonify, request, send_from_directory

app = Flask(__name__, static_folder='.')


@app.route('/')
def index():
    return send_from_directory('.', 'index.html')


@app.route('/<path:path>')
def static_proxy(path: str):
    return send_from_directory('.', path)


@app.post('/api/decision')
def decision():
    """Minimal rule-based AI endpoint for simulation decisions."""
    data = request.get_json(force=True)
    distance = float(data.get('distance', 9999))
    lane = int(data.get('lane', 1))
    lane_blocked = bool(data.get('lane_blocked', False))
    light = data.get('light', 'green')

    if light == 'red' and distance < 170:
        return jsonify({'action': 'stop', 'message': 'Red light ahead - stopping.'})

    if light == 'yellow' and distance < 110:
        return jsonify({'action': 'stop', 'message': 'Yellow light caution - braking.'})

    if lane_blocked or distance < 95:
        if lane > 0:
            return jsonify({'action': 'change_left', 'message': 'Obstacle detected - changing lane left.'})
        if lane < 2:
            return jsonify({'action': 'change_right', 'message': 'Obstacle detected - changing lane right.'})
        return jsonify({'action': 'stop', 'message': 'Lane blocked - full stop.'})

    return jsonify({'action': 'maintain', 'message': 'Lane clear - maintaining speed.'})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)
