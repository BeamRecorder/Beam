use crate::model::MediaFormat;
pub fn closest_audio_format(
    formats: &[MediaFormat],
    rate: Option<u32>,
    channels: Option<u16>,
) -> Option<&MediaFormat> {
    formats
        .iter()
        .filter(|format| matches!(format, MediaFormat::Audio { .. }))
        .min_by_key(|format| match format {
            MediaFormat::Audio {
                sample_rate,
                channels: actual_channels,
                ..
            } => {
                u64::from(rate.unwrap_or(*sample_rate).abs_diff(*sample_rate))
                    + u64::from(
                        channels
                            .unwrap_or(*actual_channels)
                            .abs_diff(*actual_channels),
                    ) * 100_000
            }
            MediaFormat::Video { .. } => u64::MAX,
        })
}
