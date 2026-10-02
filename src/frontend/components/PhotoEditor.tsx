import { useRef, useState } from "react";
import Field from "./Field";
import PhotoCropper from "./PhotoCropper";
import PhotoFrame from "./PhotoFrame";
import SelectField from "./SelectField";
import { effectivePlacement, fileToBankPhoto, newResumePhoto, placementOptions } from "../lib/photo";
import type { BankPhoto, LayoutId, PhotoAdvice, PhotoShape, PhotoSize, ResumePhoto } from "../types";
import "../styles/PhotoEditor.css";

interface PhotoEditorProps {
	photo: ResumePhoto | null | undefined;
	bank: BankPhoto[];
	onBankChange: (photos: BankPhoto[]) => void;
	advice?: PhotoAdvice;
	layout: LayoutId;
	/** Outline color (white on the Banner layout, otherwise the accent) */
	ringColor: string;
	onChange: (photo: ResumePhoto | null) => void;
}

const SHAPES: Array<{ value: PhotoShape; label: string }> = [
	{ value: "circle", label: "Circle" },
	{ value: "rounded", label: "Rounded square" },
	{ value: "square", label: "Square" },
	{ value: "portrait", label: "Portrait" },
];
const SIZES: Array<{ value: PhotoSize; label: string }> = [
	{ value: "sm", label: "Small" },
	{ value: "md", label: "Medium" },
	{ value: "lg", label: "Large" },
];

export default function PhotoEditor({
	photo,
	bank,
	onBankChange,
	advice,
	layout,
	ringColor,
	onChange,
}: PhotoEditorProps) {
	const [cropping, setCropping] = useState(false);
	// Crop as it was when Edit was pressed, so Cancel can restore it
	const [snapshot, setSnapshot] = useState<Pick<ResumePhoto, "zoom" | "fx" | "fy"> | null>(null);

	// Adding a new photo: choose a file, then name it before it joins the bank
	const fileInput = useRef<HTMLInputElement>(null);
	const [pending, setPending] = useState<BankPhoto | null>(null);
	const [pendingName, setPendingName] = useState("");
	const [nameError, setNameError] = useState("");
	const [uploadError, setUploadError] = useState("");

	const patch = (p: Partial<ResumePhoto>) => photo && onChange({ ...photo, ...p });

	const startCrop = () => {
		if (!photo) return;
		setSnapshot({ zoom: photo.zoom, fx: photo.fx, fy: photo.fy });
		setCropping(true);
	};
	const cancelCrop = () => {
		if (snapshot) patch(snapshot);
		setCropping(false);
	};

	const toggle = (on: boolean) => {
		if (!on) {
			setCropping(false);
			return onChange(null);
		}
		if (bank[0]) onChange(newResumePhoto(bank[0], layout));
	};

	const choose = (b: BankPhoto) => {
		if (photo?.photoId === b.id) return;
		setCropping(false);
		onChange(newResumePhoto(b, layout, photo));
	};

	const pickFile = async (files: FileList | null) => {
		const file = files?.[0];
		if (fileInput.current) fileInput.current.value = "";
		if (!file) return;
		setUploadError("");
		if (!file.type.startsWith("image/")) {
			setUploadError("Choose an image file such as a JPG or PNG.");
			return;
		}
		try {
			const made = await fileToBankPhoto(file);
			setPending(made);
			setPendingName(made.name);
			setNameError("");
		} catch {
			setUploadError("That file couldn’t be read as an image.");
		}
	};

	const savePending = (e: React.FormEvent) => {
		e.preventDefault();
		if (!pending) return;
		if (!pendingName.trim()) {
			setNameError("Name this photo so you can tell your photos apart.");
			return;
		}
		const added = { ...pending, name: pendingName.trim() };
		onBankChange([...bank, added]);
		onChange(newResumePhoto(added, layout, photo)); // use the new photo right away
		setCropping(false);
		setPending(null);
	};

	return (
		<div className="photo-editor">
			{advice && (
				<div className={`photo-advice ${advice.recommended ? "yes" : "no"}`} role="note">
					<strong>{advice.recommended ? "Recommended for this job" : "Not recommended for this job"}</strong>
					<span>{advice.reason}</span>
				</div>
			)}

			<label className="switch-row">
				<input
					type="checkbox"
					checked={!!photo}
					disabled={bank.length === 0}
					onChange={(e) => toggle(e.target.checked)}
				/>
				<span>Include a photo on this resume</span>
			</label>

			<div className="photo-group">
				<span className="picker-label">My Photos</span>
				<div className="bank-choices" role="radiogroup" aria-label="My Photos">
					{bank.map((b) => (
						<button
							key={b.id}
							type="button"
							role="radio"
							aria-checked={photo?.photoId === b.id}
							className={`bank-choice ${photo?.photoId === b.id ? "active" : ""}`}
							onClick={() => choose(b)}
						>
							<img src={b.src} alt="" />
							<span className="bank-name">{b.name}</span>
						</button>
					))}
					{!pending && (
						<button
							type="button"
							className="bank-choice add-tile"
							onClick={() => fileInput.current?.click()}
							aria-label="Add another photo"
						>
							<span className="add-box" aria-hidden="true">
								+
							</span>
							<span className="bank-name">New</span>
						</button>
					)}
				</div>
				<input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => pickFile(e.target.files)} />
				{bank.length === 0 && !pending && <p className="photo-empty">No photos yet. Add one to get started.</p>}
				{uploadError && (
					<span className="field-error" role="alert">
						{uploadError}
					</span>
				)}

				{pending && (
					<form className="add-photo-form" onSubmit={savePending} noValidate>
						<img className="pending-thumb" src={pending.src} alt="" />
						<Field
							id="new-photo-name"
							label="Photo name"
							value={pendingName}
							required
							error={nameError}
							onChange={(v) => {
								setPendingName(v);
								if (nameError) setNameError("");
							}}
						/>
						<div className="cropper-actions">
							<button type="submit" className="btn btn-primary">
								Add photo
							</button>
							<button type="button" className="btn btn-secondary" onClick={() => setPending(null)}>
								Cancel
							</button>
						</div>
					</form>
				)}
			</div>

			{photo && (
				<>
					<div className="photo-group">
						<span className="picker-label">Crop &amp; position</span>
						{cropping ? (
							<div className="cropper editing">
								<PhotoCropper photo={photo} onChange={(c) => patch(c)} />
								<div className="cropper-side">
									<PhotoFrame
										photo={photo}
										width={photo.shape === "portrait" ? "84px" : "110px"}
										ringColor={ringColor}
									/>
									<p className="field-hint">
										Drag inside the box to move it. Drag a corner to resize. The small preview shows
										the result.
									</p>
									<div className="cropper-actions">
										<button
											type="button"
											className="btn btn-primary"
											onClick={() => setCropping(false)}
										>
											Done
										</button>
										<button type="button" className="btn btn-secondary" onClick={cancelCrop}>
											Cancel
										</button>
										<button
											type="button"
											className="btn btn-secondary"
											onClick={() => patch({ zoom: 1, fx: 0.5, fy: 0.5 })}
										>
											Reset
										</button>
									</div>
								</div>
							</div>
						) : (
							<div className="cropper">
								<PhotoFrame
									photo={photo}
									width={photo.shape === "portrait" ? "120px" : "150px"}
									ringColor={ringColor}
								/>
								<div className="cropper-controls">
									<p className="field-hint">Choose which part of the photo shows inside the frame.</p>
									<button type="button" className="btn btn-secondary" onClick={startCrop}>
										Edit crop
									</button>
								</div>
							</div>
						)}
					</div>

					<div className="photo-selects">
						<SelectField
							id="photo-placement"
							label="Placement"
							value={effectivePlacement(photo, layout)}
							options={placementOptions(layout)}
							onChange={(placement) => patch({ placement })}
						/>
						<SelectField
							id="photo-shape"
							label="Shape"
							value={photo.shape}
							options={SHAPES}
							onChange={(shape) => patch({ shape })}
						/>
						<SelectField
							id="photo-size"
							label="Size"
							value={photo.size}
							options={SIZES}
							onChange={(size) => patch({ size })}
						/>
					</div>

					<label className="switch-row">
						<input
							type="checkbox"
							checked={photo.ring}
							onChange={(e) => patch({ ring: e.target.checked })}
						/>
						<span>
							Outline <i className="ring-swatch" style={{ background: ringColor }} />
						</span>
					</label>
				</>
			)}
		</div>
	);
}
