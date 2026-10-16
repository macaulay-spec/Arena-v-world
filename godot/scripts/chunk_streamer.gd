class_name ChunkStreamer
extends Node3D
## 128 m city tiles streamed in a 3×3 ring. Chunk JSON parsing + MeshBatch construction happen on
## worker threads; ArrayMesh, physics and NavigationRegion nodes are created on the main thread.
## No SceneTree or RenderingServer calls are made by the workers.

signal center_changed(center: Vector2i)
signal region_ready(center: Vector2i, loaded_count: int)

const CHUNK_SIZE := 128.0
const RING_RADIUS := 1
const MAX_WORKERS := 2
const CHUNK_DIR := "res://assets/world/chunks/"

var target: Node3D
var loaded: Dictionary = {}          # key -> {node: Node3D, builder: WorldBuilder}
var _wanted: Dictionary = {}         # key -> Vector2i
var _workers: Dictionary = {}        # key -> Thread
var _queue: Array[Vector2i] = []
var _results: Array[Dictionary] = []
var _failed: Dictionary = {}
var _center := Vector2i(2147483647, 2147483647)
var _region_emitted := false
var _refresh_timer := 0.0
var _process_attach_limit := 1
var stats := {"loaded_chunks": 0, "queued_chunks": 0, "worker_count": 0, "chunk_build_ms": 0}


func set_target(node: Node3D) -> void:
	target = node
	_refresh_timer = 0.0
	set_process(true)


func _ready() -> void:
	set_process(false)


func _process(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	_refresh_timer -= delta
	if _refresh_timer <= 0.0:
		_refresh_timer = 0.2
		var next := cell_for(target.global_position)
		if next != _center:
			_set_center(next)
	_poll_workers()
	_attach_ready()
	_start_workers()
	stats["loaded_chunks"] = loaded.size()
	stats["queued_chunks"] = _queue.size()
	stats["worker_count"] = _workers.size()
	if not _region_emitted and _region_complete():
		_region_emitted = true
		region_ready.emit(_center, loaded.size())
	elif _region_emitted and not _region_complete():
		_region_emitted = false


static func cell_for(pos: Vector3) -> Vector2i:
	return Vector2i(floori(pos.x / CHUNK_SIZE), floori(pos.z / CHUNK_SIZE))


static func key_for(cell: Vector2i) -> String:
	return "%d,%d" % [cell.x, cell.y]


static func filename_for(cell: Vector2i) -> String:
	return "c_%d_%d" % [cell.x, cell.y]


static func ring_for(center: Vector2i, radius: int = RING_RADIUS) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for z in range(center.y - radius, center.y + radius + 1):
		for x in range(center.x - radius, center.x + radius + 1):
			out.append(Vector2i(x, z))
	out.sort_custom(func(a: Vector2i, b: Vector2i):
		var da := maxi(absi(a.x - center.x), absi(a.y - center.y))
		var db := maxi(absi(b.x - center.x), absi(b.y - center.y))
		if da == db:
			return a.distance_squared_to(center) < b.distance_squared_to(center)
		return da < db
	)
	return out


func _set_center(center: Vector2i) -> void:
	_center = center
	_region_emitted = false
	_wanted.clear()
	for cell in ring_for(center):
		_wanted[key_for(cell)] = cell
	center_changed.emit(center)
	# Unload out-of-ring terrain/colliders immediately; new tiles are prioritized center-outward.
	for key in loaded.keys():
		if not _wanted.has(key):
			var entry: Dictionary = loaded[key]
			if is_instance_valid(entry["node"]):
				(entry["node"] as Node3D).queue_free()
			loaded.erase(key)
	_queue.clear()
	var cells: Array[Vector2i] = []
	for key in _wanted.keys():
		if not loaded.has(key) and not _workers.has(key) and not _failed.has(key):
			cells.append(_wanted[key])
	cells.sort_custom(func(a: Vector2i, b: Vector2i):
		return a.distance_squared_to(center) < b.distance_squared_to(center)
	)
	_queue = cells


func _poll_workers() -> void:
	for key in _workers.keys().duplicate():
		var thread: Thread = _workers[key]
		if thread.is_alive():
			continue
		var result = thread.wait_to_finish()
		_workers.erase(key)
		if typeof(result) == TYPE_DICTIONARY and result.has("builder"):
			if _wanted.has(key):
				_results.append({"key": key, "cell": _wanted[key], "builder": result["builder"]})
		elif _wanted.has(key):
			_failed[key] = true
			push_warning("ChunkStreamer: failed to load %s (%s)" % [key, str(result.get("error", "invalid chunk"))])


func _attach_ready() -> void:
	for _i in range(mini(_process_attach_limit, _results.size())):
		var result: Dictionary = _results.pop_front()
		var key: String = result["key"]
		if not _wanted.has(key):
			continue
		var builder: WorldBuilder = result["builder"]
		var cell: Vector2i = result["cell"]
		var root := Node3D.new()
		root.name = "Tile_%d_%d" % [cell.x, cell.y]
		add_child(root)
		builder.emit(root, true, true)
		loaded[key] = {"node": root, "builder": builder}
		stats["chunk_build_ms"] = int(stats.get("chunk_build_ms", 0)) + int(builder.stats.get("build_ms", 0))


func _start_workers() -> void:
	while _workers.size() < MAX_WORKERS and not _queue.is_empty():
		var cell: Vector2i = _queue.pop_front()
		var key := key_for(cell)
		if not _wanted.has(key) or loaded.has(key) or _workers.has(key) or _failed.has(key):
			continue
		var thread := Thread.new()
		var err := thread.start(Callable(self, "_build_chunk_worker").bind(cell))
		if err != OK:
			_failed[key] = true
			push_warning("ChunkStreamer: could not start worker for %s (error %d)" % [key, err])
		else:
			_workers[key] = thread


## Worker thread: pure parsing + mesh-array generation. Do not add nodes or create scene resources here.
func _build_chunk_worker(cell: Vector2i) -> Dictionary:
	var path := CHUNK_DIR + filename_for(cell) + ".json"
	if not FileAccess.file_exists(path):
		return {"error": "missing " + path}
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"error": "invalid JSON " + path}
	var t0 := Time.get_ticks_msec()
	var builder := WorldBuilder.new(parsed)
	builder.build_all()
	builder.stats["build_ms"] = Time.get_ticks_msec() - t0
	return {"builder": builder}


func _region_complete() -> bool:
	if _wanted.is_empty():
		return false
	for key in _wanted.keys():
		if not loaded.has(key):
			return false
	return true


func loaded_builders() -> Array[WorldBuilder]:
	var keys: Array = loaded.keys()
	keys.sort()
	var out: Array[WorldBuilder] = []
	for key in keys:
		out.append(loaded[key]["builder"])
	return out


func sidewalk_paths() -> Array:
	var paths: Array = []
	for chunk in loaded_builders():
		paths.append_array(chunk.sidewalk_paths)
	return paths


func lamp_positions() -> PackedVector3Array:
	var out := PackedVector3Array()
	for chunk in loaded_builders():
		out.append_array(chunk.lamp_positions)
	return out


func car_slots() -> Array:
	var out: Array = []
	for chunk in loaded_builders():
		out.append_array(chunk.car_slots)
	return out


func nearest_builder(pos: Vector3) -> WorldBuilder:
	var best: WorldBuilder
	var best_d := INF
	for chunk in loaded_builders():
		var center := Vector3(chunk.origin.x + (chunk.nx - 1) * chunk.grid * 0.5, 0.0, chunk.origin.y + (chunk.nz - 1) * chunk.grid * 0.5)
		var d := Vector2(pos.x - center.x, pos.z - center.z).length_squared()
		if d < best_d:
			best_d = d
			best = chunk
	return best


func height_at(x: float, z: float) -> float:
	var cell := cell_for(Vector3(x, 0.0, z))
	var key := key_for(cell)
	if loaded.has(key):
		return (loaded[key]["builder"] as WorldBuilder).height_at(x, z)
	return 0.0


func loaded_keys() -> Array[String]:
	var keys: Array[String] = []
	for key in loaded.keys():
		keys.append(str(key))
	keys.sort()
	return keys
