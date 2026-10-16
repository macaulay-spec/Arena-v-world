extends SceneTree

func _init() -> void:
	for f in ["res://rb/Male_Adult_01.fbx", "res://rb/Police_Male_01.fbx", "res://rb/m_walk_neutral.max.fbx", "res://rb/m_idle_breathe_01.max.fbx", "res://rb/m_gestic_talk_neutral_01.max.fbx", "res://rb/m_run_neutral.max.fbx"]:
		var ps: PackedScene = load(f)
		if ps == null:
			print("FAILED to load ", f); continue
		var root := ps.instantiate()
		print("\n== ", f, "  root=", root.name, " (", root.get_class(), ")")
		var tris := 0; var meshes := 0; var skels := 0; var mats := {}
		var stack := [root]
		while stack.size() > 0:
			var n: Node = stack.pop_back()
			for c in n.get_children(): stack.push_back(c)
			if n is MeshInstance3D and n.mesh:
				meshes += 1
				for s in n.mesh.get_surface_count():
					var arr = n.mesh.surface_get_arrays(s)
					var idx = arr[Mesh.ARRAY_INDEX]
					var cnt = (idx.size() if idx != null else arr[Mesh.ARRAY_VERTEX].size()) / 3
					tris += cnt
					var m = n.mesh.surface_get_material(s)
					var mname = (m.resource_name if m else "none")
					var tex := ""
					if m is BaseMaterial3D and m.albedo_texture: tex = m.albedo_texture.resource_path.get_file()
					mats[mname] = str(cnt, " tris, albedo=", tex, " transparency=", (m.transparency if m is BaseMaterial3D else -1))
				print("  mesh ", n.name, " skin=", n.skin != null, " skeleton=", n.get_node_or_null(n.skeleton) != null if n.skeleton else false)
			if n is Skeleton3D:
				skels += 1
				var names := []
				for i in n.get_bone_count(): names.append(n.get_bone_name(i))
				print("  skeleton ", n.name, " bones=", n.get_bone_count(), " first=", names.slice(0, 6), " ... facial? ", names.filter(func(x): return "Jaw" in x or "Eye" in x or "jaw" in x or "eye" in x).size())
				# bind pose check: hands height vs shoulder (A-pose vs T-pose)
				var hand = n.find_bone("Bip01 L Hand"); var sh = n.find_bone("Bip01 L UpperArm"); var head = n.find_bone("Bip01 Head"); var foot = n.find_bone("Bip01 L Foot")
				if hand >= 0 and sh >= 0:
					var ph = n.get_bone_global_rest(hand).origin; var pshd = n.get_bone_global_rest(sh).origin; var pf = n.get_bone_global_rest(foot).origin; var phd = n.get_bone_global_rest(head).origin
					print("  rest: shoulder y=%.3f hand y=%.3f (drop %.3f → %s), head y=%.3f foot y=%.3f, scale of root=%s" % [pshd.y, ph.y, pshd.y - ph.y, ("T-pose" if pshd.y - ph.y < 0.1 else "A-pose"), phd.y, pf.y, str(n.scale)])
			if n is AnimationPlayer:
				for a in n.get_animation_list():
					var an = n.get_animation(a)
					var root_tracks := 0
					for t in an.get_track_count():
						if "Bip01" in str(an.track_get_path(t)) and an.track_get_type(t) == Animation.TYPE_POSITION_3D: root_tracks += 1
					print("  animation '", a, "' length=%.2fs tracks=%d position-tracks=%d step=%.4f" % [an.length, an.get_track_count(), root_tracks, an.step])
		print("  meshes=", meshes, " triangles=", tris, " skeletons=", skels)
		for k in mats: print("  material ", k, ": ", mats[k])
		root.free()
	quit()
