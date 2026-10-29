#include "camera.h"
#include "board.h"
#include "link.h"
#include "state.h"
#include "esp_camera.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include <string.h>

static QueueHandle_t requests;
static void camera_task(void *arg)
{
    char id[37];
    for (;;) {
        if (xQueueReceive(requests, id, portMAX_DELAY) != pdTRUE) continue;
        if (!satellite.online || satellite.muted || satellite.updating) { link_camera_error(id); continue; }
        camera_config_t cfg = {
            .pin_pwdn=-1, .pin_reset=-1, .pin_xclk=43,
            .pin_sccb_sda=-1, .pin_sccb_scl=-1, .sccb_i2c_port=0,
            .pin_d0=2, .pin_d1=17, .pin_d2=18, .pin_d3=39,
            .pin_d4=45, .pin_d5=46, .pin_d6=47, .pin_d7=48,
            .pin_vsync=21, .pin_href=1, .pin_pclk=44,
            .xclk_freq_hz=20000000, .ledc_timer=LEDC_TIMER_0, .ledc_channel=LEDC_CHANNEL_0,
            .pixel_format=PIXFORMAT_JPEG, .frame_size=FRAMESIZE_VGA,
            .jpeg_quality=18, .fb_count=2, .fb_location=CAMERA_FB_IN_PSRAM,
            .grab_mode=CAMERA_GRAB_LATEST,
        };
        bool initialized=false, sent=false;
        if (board_camera_power(true)==ESP_OK && esp_camera_init(&cfg)==ESP_OK) {
            initialized=true;
            /* Let exposure settle, then discard buffered startup frames. */
            sensor_t *sensor=esp_camera_sensor_get();
            sensor->set_whitebal(sensor,1);
            sensor->set_awb_gain(sensor,1);
            sensor->set_wb_mode(sensor,0);
            sensor->set_exposure_ctrl(sensor,1);
            sensor->set_gain_ctrl(sensor,1);
            vTaskDelay(pdMS_TO_TICKS(600));
            for (int i=0;i<8;i++) {
                camera_fb_t *fb=esp_camera_fb_get();
                if (fb) {
                    if (i==7 && fb->format==PIXFORMAT_JPEG && fb->len<=80000 && !satellite.muted && !satellite.updating)
                        sent=link_camera_frame(id,fb->buf,fb->len);
                    esp_camera_fb_return(fb);
                }
            }
        }
        if (initialized) esp_camera_deinit();
        board_camera_power(false);
        if (!sent) link_camera_error(id);
        ESP_LOGI("camera","Capture request completed, sent=%d",sent);
    }
}
void satellite_camera_start(void) {
    requests=xQueueCreate(1,37);
    configASSERT(requests);
    configASSERT(xTaskCreate(camera_task,"camera",6144,NULL,3,NULL)==pdPASS);
}
bool satellite_camera_request(const char *id) {
    if (!id || strlen(id)!=36 || !requests) return false;
    char value[37]; memcpy(value,id,37);
    return xQueueSend(requests,value,0)==pdTRUE;
}
